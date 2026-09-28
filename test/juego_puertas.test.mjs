// HACIA QUÉ LADO SE ABRE UNA PUERTA.
//
// Es `CBaseDoor::DoorGoUp`, y se prueba aquí y no en el navegador porque es
// aritmética: un producto cruzado en el plano horizontal. Lo que sí necesita
// navegador —que la hoja gire y no atrape al jugador— está en la sonda.
//
// La comprobación que importa es la ASIMETRÍA: la misma puerta, el mismo
// empujón, desde los dos lados, tiene que dar signos distintos. Una regla que
// devolviera siempre lo mismo pasaría cualquier prueba que mire un solo lado —
// y eso es exactamente lo que había: `sentido` fijo desde el horneado.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { ladoDeApertura, hojaEncimaDe } from "../src/play/puertas.js";

/** Una puerta con la bisagra en el origen, eje vertical, sin banderas. */
const PUERTA = { bisagra: [0, 0, 0], sentido: 1, eje: "y", unaSolaDireccion: false };

describe("el lado al que gira la hoja", () => {
  test("se abre al revés según de qué lado vengas", () => {
    // La bisagra en el origen y la hoja hacia +X, que es como está una puerta
    // de verdad: el jugador llega al MEDIO del vano, no al canto.
    //
    // La primera versión de esto lo puso en x = 0, o sea justo en el eje de la
    // bisagra, y salían los dos iguales. No era el código: ahí el cruce vale
    // cero por los dos lados y el motor también deja el mismo signo. La prueba
    // medía el caso degenerado y lo llamaba fallo.
    const norte = ladoDeApertura(PUERTA, [0.5, 0, -1], [0, 0, 1]);
    const sur = ladoDeApertura(PUERTA, [0.5, 0, 1], [0, 0, -1]);
    assert.notEqual(norte, sur, "desde los dos lados tiene que girar distinto");
    assert.ok(Math.abs(norte) === 1 && Math.abs(sur) === 1);
  });

  test("y lo que decide es la MIRADA, no sólo dónde estás", () => {
    // Mismo sitio, mirada opuesta: el motor usa `v_forward`, así que cambia.
    const a = ladoDeApertura(PUERTA, [1, 0, 0], [0, 0, 1]);
    const b = ladoDeApertura(PUERTA, [1, 0, 0], [0, 0, -1]);
    assert.notEqual(a, b);
  });

  test("empujar de frente abre hacia donde empujas", () => {
    // El jugador está a −Z de la bisagra y avanza hacia +Z, ligeramente
    // desplazado en X: la hoja tiene que irse del lado contrario a él.
    const p = { ...PUERTA, bisagra: [0, 0, 0] };
    const signo = ladoDeApertura(p, [0.5, 0, -1], [0, 0, 1]);
    // Con el jugador en +X y mirando a +Z, el cruce `dz·fx − dx·fz` vale
    // (−1)(0) − (0,5)(1) = −0,5, o sea negativo: se va al −1.
    assert.equal(signo, -1);
    // Y el simétrico en X da el contrario, que es la mitad que no se puede
    // sacar mirando un solo caso.
    assert.equal(ladoDeApertura(p, [-0.5, 0, -1], [0, 0, 1]), 1);
  });

  test("el cruce exactamente a cero deja el +1, como el `< 0` del motor", () => {
    // Justo en el eje de la bisagra: `dz·fx − dx·fz` = 0, y entonces el lado
    // del que vengas da igual. Es el caso degenerado del motor, y merece una
    // prueba porque es la trampa en la que cayó la primera versión de la de
    // arriba: mirado ahí, «la regla no distingue lados» parece un fallo.
    assert.equal(ladoDeApertura(PUERTA, [0, 0, -1], [0, 0, 1]), 1);
    assert.equal(ladoDeApertura(PUERTA, [0, 0, 1], [0, 0, -1]), 1);
  });
});

describe("cuándo NO se mira a quién abre", () => {
  test("con SF_DOOR_ONEWAY manda la entidad", () => {
    const p = { ...PUERTA, unaSolaDireccion: true };
    assert.equal(ladoDeApertura(p, [0.5, 0, -1], [0, 0, 1]), 1);
    assert.equal(ladoDeApertura(p, [-0.5, 0, -1], [0, 0, 1]), 1);
  });

  test("y con SF_DOOR_ROTATE_BACKWARDS se invierten los dos lados, no uno", () => {
    // El motor multiplica: `AngularMove(m_vecAngle2 * sign)`, y `m_vecAngle2`
    // ya trae el volteo de la bandera. O sea que la bandera no elige un lado:
    // cambia los dos.
    const normal = { ...PUERTA, sentido: 1 };
    const alReves = { ...PUERTA, sentido: -1 };
    for (const desde of [[0.5, 0, -1], [-0.5, 0, -1]]) {
      assert.equal(
        ladoDeApertura(alReves, desde, [0, 0, 1]),
        -ladoDeApertura(normal, desde, [0, 0, 1]),
      );
    }
  });

  test("una trampilla no tiene «tu lado»", () => {
    // El motor condiciona la cuenta a `pev->movedir.y`, o sea a bisagra
    // vertical. Con eje X o Z manda la entidad.
    for (const eje of ["x", "z"]) {
      const p = { ...PUERTA, eje };
      assert.equal(ladoDeApertura(p, [0.5, 0, -1], [0, 0, 1]), 1);
      assert.equal(ladoDeApertura(p, [-0.5, 0, -1], [0, 0, 1]), 1);
    }
  });

  test("sin activador manda la entidad: es el caso del botón", () => {
    assert.equal(ladoDeApertura(PUERTA, null, null), 1);
    assert.equal(ladoDeApertura({ ...PUERTA, sentido: -1 }, null, null), -1);
  });
});

describe("dónde está la hoja mientras gira", () => {
  // Una puerta de 1 m de ancho y 2 de alto, con la bisagra en el origen y la
  // hoja hacia +X. Cerrada ocupa la franja delgada en Z.
  const HOJA = {
    bisagra: [0, 0, 0],
    caja: { min: [0, 0, -0.05], max: [1, 2, 0.05] },
  };
  const RADIO = 0.3;

  test("cerrada, tapa el vano y no lo de al lado", () => {
    assert.equal(hojaEncimaDe(HOJA, 0, 1, [0.5, 0, 0], RADIO), true);
    assert.equal(hojaEncimaDe(HOJA, 0, 1, [0.5, 0, 1], RADIO), false);
  });

  test("abierta 90°, ya NO tapa el vano y tapa el costado", () => {
    // Ésta es la que distingue girar el PUNTO de girar la CAJA: la envolvente
    // de una hoja a 45° cubre el vano Y el costado a la vez, así que con ella
    // una puerta abierta seguiría «tocando» a quien pasa por debajo.
    //
    // Y el costado es −Z y no +Z: un giro de +90° sobre +Y en ejes de Three
    // lleva (1,0,0) a (0,0,−1). Lo escribí al revés la primera vez, y no lo
    // dijo el código —que estaba bien— sino esta prueba.
    assert.equal(hojaEncimaDe(HOJA, 90, 1, [0.5, 0, 0], RADIO), false);
    assert.equal(hojaEncimaDe(HOJA, 90, 1, [0, 0, -0.5], RADIO), true);
  });

  test("y el signo manda: a −90° tapa el otro costado", () => {
    assert.equal(hojaEncimaDe(HOJA, 90, -1, [0, 0, 0.5], RADIO), true);
    assert.equal(hojaEncimaDe(HOJA, 90, -1, [0, 0, -0.5], RADIO), false);
  });

  test("un radio mayor la hace tocar antes", () => {
    const justoFuera = [0.5, 0, 0.2];
    assert.equal(hojaEncimaDe(HOJA, 0, 1, justoFuera, 0.1), false);
    assert.equal(hojaEncimaDe(HOJA, 0, 1, justoFuera, 0.5), true);
  });

  test("por encima de la puerta no toca", () => {
    assert.equal(hojaEncimaDe(HOJA, 0, 1, [0.5, 4, 0], RADIO), false);
  });
});

describe("la bisagra importa, y no sólo la posición absoluta", () => {
  test("la misma postura del jugador con la bisagra al otro lado da lo contrario", () => {
    const a = { ...PUERTA, bisagra: [0, 0, 0] };
    const b = { ...PUERTA, bisagra: [1, 0, 0] };
    const desde = [0.5, 0, -1], mirando = [0, 0, 1];
    assert.notEqual(ladoDeApertura(a, desde, mirando), ladoDeApertura(b, desde, mirando));
  });
});
