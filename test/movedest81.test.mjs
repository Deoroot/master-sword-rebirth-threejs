// EXPERIMENTO 81 · `setmovedest`: el gancho que llevaba un `=> {}` desde el 43.
//
// Lo que esto mide es la RESOLUCIÓN del destino —`src/play/movedest.js`—, que es
// la mitad que faltaba. La otra, andar hasta el punto y avisar al guion, está
// medida desde el 77 en `test/escena77.test.mjs` y no se repite aquí.
//
// ── LO QUE ESTA PRUEBA NO PUEDE MEDIR, DICHO ANTES DE EMPEZAR ───────────────
//
// Que un NPC del juego obedezca a su guion. El gancho `irA` vive en
// `src/play/npcguion.js`, que en esta sesión lo lleva la otra; hasta que el
// reenvío esté puesto, el viaje entero —guion → entorno → manada → pantalla— no
// tiene control y **no se cuenta ningún verde por él**. Es exactamente la
// trampa del 59/63 que esta misma prueba podría cometer: si yo le construyo el
// gancho a mano, mido que la función sabe resolver y no que alguien la llama.
// Las cuatro pruebas del 43 hacen eso, y por eso llevan ocho experimentos
// verdes sobre un `=> {}`.
//
// ── EL CENSO, QUE SE CUENTA Y NO SE ESCRIBE ─────────────────────────────────
//
// Los números de cuántos `setmovedest` hay y de qué forma salen de leer el
// horneado (apartado 5 de CLAUDE.md). Lo que va escrito a mano es lo que ES la
// regla —el `* 1.1`, el 200 y el 128 de las trazas, el 0,9 que no era— con su
// cita al lado, que es la lección del 75: cuando el número es la regla, un
// `assert` que lo compara con la constante que lo define no mide nada.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  destinoDeSetmovedest, puntoDeUnGuion, puntoDeSuperficie, rumboDeHuida,
  proximidadPorOmision, ganchoDeMovedest, loVe,
} from "../src/play/movedest.js";
import { haLlegado } from "../src/play/escena.js";
import { Manada, ojoDe } from "../src/play/manada.js";

/** Una rata del templo de Edana: 32x32x32, el `setsize` que el 80 trajo del guion. */
const RATA = { ancho: 32, alto: 32, vuela: false, esBicho: true };

/** Quien se mueve, en unidades y ejes del puerto. En el origen, mirando donde sea. */
const yoEn = (x, y, z, { ancho = 32, alto = 32 } = {}) => ({
  ojo: [x, y + alto, z],                 // `view_ofs = m_Height`
  centro: [x, y + alto / 2, z],          // `Center()`
  ancho, alto,
});

/** Un dado de 0 a 1 que da siempre lo mismo, para que la huida sea reproducible. */
const dadoFijo = (v) => () => v;

describe("`setmovedest`: los números que SON la regla", () => {
  // Escrito a mano y con su cita, porque comparar con la constante que lo
  // define es el fallo del 75: `GetDefaultMoveProximity()` es `m_Width * 1.1`
  // (msmonster.h:355) y de ahí sale el hallazgo del 77.
  test("la proximidad por omisión es el ancho por 1,1 — msmonster.h:355", () => {
    assert.equal(proximidadPorOmision(32), 35.2);
    assert.equal(proximidadPorOmision(72), 79.2);
  });

  test("y por eso Edrin ya estaba llegado antes de empezar (el 77)", () => {
    // Edrin nace a 32 unidades de su `edrinspot` y su ancho es 32, o sea 35,2
    // de proximidad: la escena no le hace andar un paso. El control que mide un
    // viaje tiene que pedir MÁS QUE UNA PROXIMIDAD ENTERA, porque los dos
    // viajes paran en el borde del círculo.
    const yo = yoEn(0, 0, 0);
    assert.ok(haLlegado({ destino: [32, 32, 0], ojo: yo.ojo, proximidad: proximidadPorOmision(32) }));
    assert.ok(!haLlegado({ destino: [36, 32, 0], ojo: yo.ojo, proximidad: proximidadPorOmision(32) }));
  });

  test("el ojo de un bicho es su ALTO ENTERO, no el 0,9 del jugador", () => {
    // `pev->view_ofs = Vector(0, 0, m_Height)` — msmonsterserver.cpp:250.
    // El 0,9 que había en los cuatro sitios es la proporción del JUGADOR: caja
    // de 72, ojo a 64 (`src/play/movimiento.js:453`), o sea 0,889.
    assert.equal(ojoDe({ ficha: { ia: { alto: 32 } } }), 32);
    assert.equal(ojoDe({ ficha: { alto: 72 } }), 72);
    // Y el control que importa: que NO sea el 0,9. Sin esto, cambiar `ojoDe`
    // por `alto * 0.9` deja esta prueba verde.
    assert.notEqual(ojoDe({ ficha: { ia: { alto: 32 } } }), 32 * 0.9);
  });
});

describe("LOS EJES, que es donde esto se rompe sin dar un error", () => {
  test("`(x y z)` viene en ejes del `.bsp` y sale en ejes del puerto", () => {
    // `(-3101,351,64)` es de `monsters/base_npc_attack_new.script`, con comas.
    // En el `.bsp` la altura es la Z; aquí es la Y. `aEscena` es `[x, z, -y]`
    // (src/bsp/lector.js:402) y esto es lo mismo sin dividir por `U`.
    //
    // Los tres números son distintos y ninguno es cero A PROPÓSITO: con un
    // punto como `(100 0 0)` el cambio de ejes y el no cambiarlos dan lo mismo,
    // y la prueba se quedaría verde con el fallo puesto. Es la lección del 71.
    assert.deepEqual(puntoDeUnGuion("(-3101,351,64)"), [-3101, 64, -351]);
    assert.deepEqual(puntoDeUnGuion("(100 20 3)"), [100, 3, -20]);
    // Y que NO es el vector crudo, que es el fallo contra el que esto defiende.
    assert.notDeepEqual(puntoDeUnGuion("(-3101,351,64)"), [-3101, 351, 64]);
  });

  test("sin tres números devuelve `null`, que no es el origen del mapa", () => {
    // `[0,0,0]` es un sitio al que se puede andar y la basura no. Si esto
    // devolviera el origen, un `setmovedest` mal escrito mandaría a todo el
    // pueblo a la esquina del mapa sin un solo error.
    assert.equal(puntoDeUnGuion("(100 20)"), null);
    assert.equal(puntoDeUnGuion("(a b c)"), null);
    assert.equal(puntoDeUnGuion(""), null);
  });
});

describe("a una ENTIDAD: el punto de superficie, no el centro", () => {
  test("contra un bicho se apunta a su piel, a `ancho/2` de su ojo", () => {
    // `NewDest.Origin = pEntity->EyePosition() + vRay.Normalize() * Size`
    // con `Size = m_Width / 2` — npcscript.cpp:1655-1659. Y los dos tamaños son
    // DEL OBJETIVO: `pMonster` es a quien persigo.
    //
    // La rata está en (100,0,0) con su ojo a 32; yo en el origen con el mío a
    // 32. El rayo va de su ojo al mío, o sea −X, y el punto queda 16 unidades
    // más cerca de mí: x = 100 − 16 = 84, a la misma altura.
    const p = puntoDeSuperficie({ miOjo: [0, 32, 0], suOjo: [100, 32, 0], ...RATA });
    assert.deepEqual(p, [84, 32, 0]);
  });

  test("volando el tamaño es la diagonal de media caja", () => {
    // `sqrt(pow(m_Width/2, 2) + pow(m_Height/2, 2))`, :1654. Con 32x32 eso es
    // sqrt(16² + 16²) = 22,627, no 16: un volador se para más lejos.
    const p = puntoDeSuperficie({ miOjo: [0, 32, 0], suOjo: [100, 32, 0], ancho: 32, alto: 32, vuela: true });
    assert.ok(Math.abs(p[0] - (100 - Math.hypot(16, 16))) < 1e-9);
    assert.notEqual(p[0], 84);            // y NO es el del que anda
  });

  test("con los dos ojos en el mismo punto sale ARRIBA, con su `// ????`", () => {
    // `Vector::Normalize()` devuelve `Vector(0,0,1)` cuando la longitud es cero
    // —vector.h:109-116, con el comentario de cuatro interrogaciones del propio
    // motor—. En los ejes del puerto eso es `[0,1,0]`: el destino acaba justo
    // encima del objetivo. Devolver cero sería más razonable y no sería MSR.
    const p = puntoDeSuperficie({ miOjo: [50, 32, 10], suOjo: [50, 32, 10], ...RATA });
    assert.deepEqual(p, [50, 48, 10]);    // 32 + 16 de altura
  });

  test("y el rayo es de TRES componentes: la altura entra", () => {
    // Perseguir a algo que está en un tejado da un punto más alto que mi ojo.
    // La proximidad lo tira después si quien persigue anda (`Length2D`) y no lo
    // tira si vuela — son dos reglas y están las dos.
    const p = puntoDeSuperficie({ miOjo: [0, 32, 0], suOjo: [0, 232, 0], ...RATA });
    assert.deepEqual(p, [0, 216, 0]);     // 232 − 16, hacia mí o sea hacia abajo
  });

  test("contra lo que NO es un bicho se apunta al OJO pelado", () => {
    // La rama `else` de :1660: `NewDest.Origin = pEntity->EyePosition()`. Sin
    // este caso, un `setmovedest` a un `info_target` se correría `ancho/2`, y un
    // `info_target` no tiene ancho. Es el segundo caso que el apartado 4 pide:
    // con sólo bichos, el punto de superficie y el ojo pelado no se distinguen.
    const buscar = () => ({ ojo: [100, 40, 0], centro: [100, 20, 0], ancho: 0, alto: 0, esBicho: false });
    const r = destinoDeSetmovedest({ yo: yoEn(0, 0, 0), destino: { entidad: "flowerspot" }, proximidad: 10, buscar });
    assert.deepEqual(r.origen, [100, 40, 0]);
  });

  test("al mismo destino, un bicho y un no-bicho dan puntos DISTINTOS", () => {
    const comun = { ojo: [100, 32, 0], centro: [100, 16, 0], ancho: 32, alto: 32 };
    const yo = yoEn(0, 0, 0);
    const bicho = destinoDeSetmovedest({
      yo, destino: { entidad: "x" }, proximidad: 10, buscar: () => ({ ...comun, esBicho: true }),
    });
    const cosa = destinoDeSetmovedest({
      yo, destino: { entidad: "x" }, proximidad: 10, buscar: () => ({ ...comun, esBicho: false }),
    });
    assert.notDeepEqual(bicho.origen, cosa.origen);
    assert.equal(cosa.origen[0] - bicho.origen[0], 16);   // justo `ancho/2`
  });
});

describe("los CUATRO ceros, que en pantalla se ven igual", () => {
  // Un NPC quieto puede ser cualquiera de los cuatro, y sin separarlos no se
  // puede medir ninguno. Es la lección del `frenado` de `avanzar`.
  const yo = yoEn(0, 0, 0);

  test("`none` no es un fallo: es soltar el destino", () => {
    const r = destinoDeSetmovedest({ yo, destino: null });
    assert.equal(r.parar, true);
    assert.equal(r.porQue, undefined);
    assert.equal(r.origen, undefined);
  });

  test("una entidad que no existe se dice por su nombre", () => {
    const r = destinoDeSetmovedest({ yo, destino: { entidad: "nadie" }, proximidad: 10, buscar: () => null });
    assert.equal(r.origen, undefined);
    assert.match(r.porQue, /nadie/);
  });

  test("un punto que no son tres números", () => {
    const r = destinoDeSetmovedest({ yo, destino: { punto: "(1 2)" }, proximidad: 10 });
    assert.equal(r.origen, undefined);
    assert.match(r.porQue, /tres numeros/);
  });

  test("y acorralado al huir, que es el que necesita control positivo", () => {
    const buscar = () => ({ ojo: [100, 32, 0], centro: [100, 16, 0], ...RATA });
    const nada = destinoDeSetmovedest({
      yo, destino: { entidad: "jugador" }, proximidad: 300, huir: true, buscar, libre: () => false,
    });
    assert.equal(nada.origen, undefined);
    assert.match(nada.porQue, /acorralado/);
    // EL CONTROL POSITIVO: lo mismo con un rumbo despejado SÍ da destino. Sin
    // esto, «no se movió» podría ser que la huida no se ejecute nunca.
    const si = destinoDeSetmovedest({
      yo, destino: { entidad: "jugador" }, proximidad: 300, huir: true, buscar, libre: () => true,
    });
    assert.ok(Array.isArray(si.origen));
  });
});

describe("HUIR: dos búsquedas, y la segunda sólo si la primera falla", () => {
  const suCentro = [100, 16, 0];          // el que me da miedo, al este
  const miCentro = [0, 16, 0];

  test("el rumbo de huida sale de ESPALDAS al que asusta", () => {
    // `FleeDir = (Center() - pEntity->Center()).Normalize()` con `z = 0`: de él
    // a mí, o sea −X. Con el dado centrado (0,5 → +0 grados) el rumbo es 180°.
    const h = rumboDeHuida({ miCentro, suCentro, azar: dadoFijo(0.5) });
    assert.equal(Math.round(h.rumbo), 180);
    assert.ok(h.adelante[0] < -0.99);      // se va hacia −X
    assert.equal(h.aLaBruta, false);
    assert.equal(h.intentos, 1);
  });

  test("el rumbo va en [0, 360) como el motor, no en (−180, 180]", () => {
    // `if (yaw < 0) yaw += 360` — ReHLDS, engine/mathlib.cpp:166-167. Mirar al
    // oeste es 180 y no −180. Para `adelante` da igual, pero el rumbo se apunta
    // y se compara con el del motor. Esta prueba nació roja leyendo −180 y el
    // que estaba mal era el código.
    for (const [mi, su] of [[[0, 16, 0], [100, 16, 0]], [[0, 16, 0], [0, 16, 100]],
      [[0, 16, 0], [-100, 16, 0]], [[0, 16, 0], [0, 16, -100]]]) {
      const h = rumboDeHuida({ miCentro: mi, suCentro: su, azar: dadoFijo(0.5) });
      assert.ok(h.rumbo >= 0 && h.rumbo < 360, `rumbo ${h.rumbo}`);
    }
  });

  // NO ES UN CONTROL: DOCUMENTA. No se cuenta entre los verdes.
  //
  // Con los dos centros en el mismo punto el rumbo sale 0, y sale igual con la
  // guarda del motor puesta o quitada —`atan2(-0, 0)` es `-0`, que es `=== 0`—.
  // O sea que esta prueba **no puede ponerse roja** por ese mecanismo, y por eso
  // va dicho aquí en vez de dejar que alguien la cuente como medida. La razón
  // está en `rumboDe` (`src/play/movedest.js`): la rama del motor es para el
  // pitch. Se queda porque afirma que el caso no revienta ni da `NaN`, que es lo
  // que de verdad importaría — el `NaN` del 78 que paró una física entera.
  test("con los dos centros en el MISMO punto no revienta (documenta, no mide)", () => {
    const h = rumboDeHuida({ miCentro: [50, 16, 10], suCentro: [50, 16, 10], azar: dadoFijo(0.5) });
    assert.equal(h.rumbo, 0);
    assert.ok(h.adelante.every(Number.isFinite), "y ni un NaN en el rumbo");
  });

  test("la primera vuelta traza 200 unidades y la segunda 128", () => {
    // Son dos números del motor (:1677 y :1694) y no uno. Se miden mirando qué
    // largo se le pide al `libre`, que es lo único que los distingue.
    const largos = [];
    rumboDeHuida({
      miCentro, suCentro, azar: dadoFijo(0.5),
      libre: (a, b) => { largos.push(Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))); return false; },
    });
    // 20 al azar a 200, luego 359 a la bruta a 128.
    assert.equal(largos.length, 20 + 359);
    assert.deepEqual([...new Set(largos.slice(0, 20))], [200]);
    assert.deepEqual([...new Set(largos.slice(20))], [128]);
  });

  test("si ninguno de los veinte sale, entra la fuerza bruta y lo DICE", () => {
    // Sólo se deja pasar la traza corta: así la primera vuelta (200) falla
    // siempre y la segunda (128) acierta. `aLaBruta` existe para poder medirlo;
    // sin él, las dos búsquedas son indistinguibles desde fuera.
    const h = rumboDeHuida({
      miCentro, suCentro, azar: dadoFijo(0.5),
      libre: (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 150,
    });
    assert.equal(h.aLaBruta, true);
    assert.ok(h.intentos > 20);
  });

  test("huyendo la proximidad NO es el parámetro: es la de por omisión", () => {
    // `NewDest.Proximity = GetDefaultMoveProximity()` (:1704) mientras el
    // parámetro se gasta en la DISTANCIA (`Center() + fleeVec * flDistanceParm`,
    // :1702). El mismo número con dos oficios, y el motor lo llama
    // `flDistanceParm` justo por eso.
    const r = destinoDeSetmovedest({
      yo: yoEn(0, 0, 0), destino: { entidad: "jugador" }, proximidad: 300, huir: true,
      buscar: () => ({ ojo: [100, 32, 0], centro: suCentro, ...RATA }),
      azar: dadoFijo(0.5),
    });
    assert.equal(r.huyendo, true);
    assert.equal(r.proximidad, 35.2);            // el ancho por 1,1, no 300
    assert.notEqual(r.proximidad, 300);
    // Y el destino está a 300 del CENTRO, que es de donde se mide la huida.
    const d = Math.hypot(r.origen[0] - 0, r.origen[2] - 0);
    assert.ok(Math.abs(d - 300) < 1e-6, `huye a ${d}`);
    assert.equal(r.cancelarEn, 5.0);             // y no los siete de siempre
  });

  test("huir es lo CONTRARIO de perseguir, con el mismo objetivo", () => {
    // El control que separa las dos ramas: el mismo comando con y sin `flee`
    // manda a sitios opuestos. Sin este caso, un `huir` que se ignorase daría
    // un destino plausible —el del objetivo— y nadie lo vería.
    const buscar = () => ({ ojo: [100, 32, 0], centro: suCentro, ...RATA });
    const comun = { yo: yoEn(0, 0, 0), destino: { entidad: "jugador" }, proximidad: 300, buscar, azar: dadoFijo(0.5) };
    const voy = destinoDeSetmovedest({ ...comun, huir: false });
    const huyo = destinoDeSetmovedest({ ...comun, huir: true });
    assert.ok(voy.origen[0] > 0, "perseguir va hacia él");
    assert.ok(huyo.origen[0] < 0, "huir va al otro lado");
  });
});

describe("EL IDIOMA QUE SE LLEVA LA MITAD DE EDANA: proximidad 9999", () => {
  // `setmovedest PARAM1 9999` no es «anda hasta el jugador»: 9999 es más que
  // cualquier distancia del mapa, así que `SetMoveDest` entra en su rama de
  // «¿ya está cerca?» EN EL PRIMER THINK, le pone el ángulo exacto, llama a
  // `StopWalking()` y dispara `game_reached_dest` (:1018-1029).
  //
  // O sea que es **«gírate a mirar a eso y párate»**, y es con lo que un vecino
  // de Edana se vuelve hacia ti cuando le hablas. Son 65 de los 130 de Edana.
  test("con 9999 se llega en el primer paso, o sea que sólo GIRA", () => {
    const yo = yoEn(0, 0, 0);
    assert.ok(haLlegado({ destino: [2000, 32, -1500], ojo: yo.ojo, proximidad: 9999 }));
  });

  test("y con la proximidad de verdad NO se llega: hay que andar", () => {
    // El control que demuestra que lo de arriba no es «siempre se llega».
    const yo = yoEn(0, 0, 0);
    assert.ok(!haLlegado({ destino: [2000, 32, -1500], ojo: yo.ojo, proximidad: 35.2 }));
  });
});

describe("EL VIAJE ENTERO, por el camino por el que lo hace el juego", () => {
  // Esto entra por `ganchoDeMovedest` —que es lo que `entornoDe.irA` reenvía— y
  // mueve una `Manada` de verdad. NO se construye el asa a mano: la lección del
  // 59 y del 63 es que si el asa la construye quien prueba, lo que se prueba es
  // el asa. Lo que sigue sin medirse aquí es el tramo guion → entorno, que es la
  // línea que falta en quien monta los NPC; va dicho arriba.
  const U = 39.37;
  /** Una rata de 32x32x32 en el origen, con velocidad porque no hay `.mdl`. */
  const conUnaRata = () => {
    const m = new Manada({
      unidadesPorMetro: U,
      colocados: [{
        clave: "rata", escena: [0, 0, 0], yaw: 0, nombre: "Giant Rat",
        script: "monsters/giantrat", andando: "walk",
        ia: { ancho: 32, alto: 32, corriendo: "run" },
      }],
    }, { azar: () => 0.5 });
    const i = m.instancias[0];
    i.velocidad = 2; i.velocidadCorriendo = 3;
    return { m, i };
  };
  const andar = (m, i, segundos) => {
    for (let t = 0; t < segundos; t += 1 / 20) {
      m.pasear(1 / 20, { libre: () => true, suelo: () => i.donde[1] });
    }
  };

  test("un `setmovedest` a un punto hace ANDAR, y los tres avisos llegan en orden", () => {
    const { m, i } = conUnaRata();
    const avisos = [];
    const irA = ganchoDeMovedest({
      manada: m, instancia: i, avisar: (n) => avisos.push(n),
    });
    // `setmovedest (400 0 0) 35.2` — en ejes del `.bsp`, o sea 400 al este.
    assert.equal(irA({ punto: "(400 0 0)" }, { proximidad: 35.2 }), true);
    assert.ok(i.mandado, "la condición `MONSTER_HASMOVEDEST` está puesta");
    const partida = i.donde[0];
    andar(m, i, 10);
    assert.ok(i.donde[0] - partida > 35.2 / U,
      `ha andado ${((i.donde[0] - partida) * U).toFixed(1)} u, y una proximidad son 35,2`);
    // El orden del motor: `StopWalking()` primero (:1026) y el evento de llegada
    // en la línea siguiente (:1027). Es al revés de como se lee.
    assert.deepEqual(avisos.filter((a) => a !== "game_movingto_dest"),
      ["game_stopmoving", "game_reached_dest"]);
    assert.ok(avisos.includes("game_movingto_dest"), "y ha avisado mientras andaba");
    assert.equal(avisos.indexOf("game_stopmoving") < avisos.indexOf("game_reached_dest"), true);
  });

  test("EL VIAJE QUE NO LLEGABA UNO DE CADA CINCO: muchas distancias, todas llegan", () => {
    // Un solo destino no vale para medir esto, y es la lección del 50 llevada a
    // la aritmética: el fallo depende de cómo caiga el último bit de un `double`,
    // así que con UNA distancia el control es una moneda. Medido sobre el par
    // (distancia, proximidad), el 21,3 % caía del lado de «todavía no» y el NPC
    // se quedaba clavado en el borde del círculo con la animación de andar
    // puesta y `game_reached_dest` sin disparar — una escena colgada para
    // siempre. Ver la nota del 81 en `pasoMandado`.
    const sinLlegar = [];
    for (const d of [200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000]) {
      for (const prox of [5, 10, 35.2, 50]) {
        const { m, i } = conUnaRata();
        const avisos = [];
        ganchoDeMovedest({ manada: m, instancia: i, avisar: (n) => avisos.push(n) })(
          { punto: `(${d} 0 0)` }, { proximidad: prox },
        );
        andar(m, i, 40);                 // de sobra para 2 m/s y 2 000 unidades
        if (!avisos.includes("game_reached_dest")) sinLlegar.push(`${d}u/${prox}`);
      }
    }
    assert.deepEqual(sinLlegar, [],
      `${sinLlegar.length} de 40 viajes no llegan nunca: ${sinLlegar.join(", ")}`);
  });

  test("y el control de que ese viaje se MIDE: con el destino lejísimos no llega", () => {
    // El positivo del negativo de arriba. Si el bucle anterior saliera verde
    // porque `game_reached_dest` se dispara siempre, esto también lo haría.
    const { m, i } = conUnaRata();
    const avisos = [];
    ganchoDeMovedest({ manada: m, instancia: i, avisar: (n) => avisos.push(n) })(
      { punto: "(100000 0 0)" }, { proximidad: 35.2 },
    );
    andar(m, i, 5);
    assert.ok(!avisos.includes("game_reached_dest"), "no puede haber llegado a 100 000 u");
    assert.ok(avisos.includes("game_movingto_dest"), "pero sí va andando");
  });

  test("el control negativo: sin el gancho no se mueve ni avisa nadie", () => {
    // Es el `=> {}` del 43, puesto a propósito. Sin este control, el de arriba
    // podría estar midiendo que la rata se pasea sola.
    const { m, i } = conUnaRata();
    const irA = () => {};                       // lo que había desde el 43
    irA({ punto: "(400 0 0)" }, { proximidad: 35.2 });
    const partida = i.donde[0];
    andar(m, i, 10);
    assert.equal(i.mandado, null);
    assert.ok(Math.abs(i.donde[0] - partida) < 1e-9,
      `se ha movido ${((i.donde[0] - partida) * U).toFixed(1)} u sin que nadie se lo mande`);
  });

  test("`setmovedest none` suelta el destino y NO borra la copia (fallo portado)", () => {
    const { m, i } = conUnaRata();
    const irA = ganchoDeMovedest({ manada: m, instancia: i });
    irA({ punto: "(400 0 0)" }, { proximidad: 35.2 });
    const copia = i.ultimoDestino;
    assert.ok(copia, "`m_MoveDest` escrito");
    irA(null);                                   // `setmovedest none`
    assert.equal(i.mandado, null, "la condición apagada");
    // Y la copia SIGUE: el motor no toca `m_MoveDest`, y de eso depende que una
    // escena del mapa se crea que el NPC ha llegado. `doc/AVISOS.md:820`.
    assert.deepEqual(i.ultimoDestino, copia);
  });

  test("y al mandarlo a otro sitio, la copia cambia: es cómo una escena se entera", () => {
    // `if (pMonster->m_MoveDest != m_MoveDest)` — npcact.cpp:229. El control que
    // demuestra que lo de arriba no es «la copia nunca cambia».
    const { m, i } = conUnaRata();
    const irA = ganchoDeMovedest({ manada: m, instancia: i });
    irA({ punto: "(400 0 0)" }, { proximidad: 35.2 });
    const antes = JSON.stringify(i.ultimoDestino);
    irA({ punto: "(0 400 0)" }, { proximidad: 35.2 });
    assert.notEqual(JSON.stringify(i.ultimoDestino), antes);
  });

  test("un destino que no se puede resolver se APUNTA, no se calla", () => {
    const { m, i } = conUnaRata();
    const apuntes = [];
    const irA = ganchoDeMovedest({
      manada: m, instancia: i, buscar: () => null,
      apuntar: (tipo, porQue) => apuntes.push(`${tipo}: ${porQue}`),
    });
    assert.equal(irA({ entidad: "nadie" }, { proximidad: 10 }), false);
    assert.equal(i.mandado, null);
    assert.equal(apuntes.length, 1);
    assert.match(apuntes[0], /nadie/);
  });
});

describe("`FMVisible`: la regla del rayo, que es UNA para los dos mundos", () => {
  // Hay dos físicas —el navegador y el servidor— así que el rayo se tira dos
  // veces por fuerza. Lo que NO puede estar dos veces es la regla, y ésta es:
  // `loVe`. Se puede medir aquí, sin navegador y sin servidor, porque el trazo
  // se inyecta — que es justo lo que ninguna de las dos copias permitía.
  const OJO_NPC = [0, 0.81, 0];        // un bicho de 32 u, ojo arriba del casco
  const OJO_JUG = [3, 1.62, 0];        // el jugador a tres metros

  test("sin nada en medio se ve: el rayo llega entero", () => {
    // `if (tr.flFraction != 1.0) ... else return TRUE` — combat.cpp:1238-1247.
    assert.equal(loVe({ miOjo: OJO_NPC, suOjo: OJO_JUG, suColisionador: 7, trazar: () => null }), true);
  });

  test("con una PARED en medio no se ve", () => {
    assert.equal(loVe({ miOjo: OJO_NPC, suOjo: OJO_JUG, suColisionador: 7, trazar: () => 99 }), false);
  });

  test("y CHOCAR CONTRA ÉL es verle, que es la línea que no se adivina", () => {
    // `return tr.pHit == pEntity->edict()` (:1240). Sin esta regla el rayo
    // termina en el ojo del jugador y se topa con su propia cápsula medio metro
    // antes, así que **no se vería a nadie nunca** — está medido: un goblin a
    // tres metros no se enteraba de nada y no daba ningún error.
    assert.equal(loVe({ miOjo: OJO_NPC, suOjo: OJO_JUG, suColisionador: 7, trazar: () => 7 }), true);
  });

  test("se compara el `handle` y NO el objeto: dos envoltorios del mismo colisionador", () => {
    // Con `castRay`, el envoltorio JS que devuelve Rapier no es el mismo objeto
    // que guardó quien creó el colisionador, así que un `===` sobre el objeto es
    // `false` siempre. Aquí se simula: dos objetos distintos con el mismo
    // `handle`. Si `loVe` comparase objetos, esto saldría rojo.
    const suyo = { handle: 7 }, elQueVuelve = { handle: 7 };
    assert.notEqual(suyo, elQueVuelve, "son dos objetos distintos a propósito");
    assert.equal(loVe({
      miOjo: OJO_NPC, suOjo: OJO_JUG,
      suColisionador: suyo.handle, trazar: () => elQueVuelve.handle,
    }), true);
  });

  test("sin colisionador NO se finge que se ve", () => {
    // Un objetivo sin cuerpo —un `info_target`— no se puede «tocar», así que la
    // regla 2 no se puede cumplir. Devolver `true` aquí sería un `$cansee` que
    // dice sí a todo, que es peor que uno que dice no.
    assert.equal(loVe({ miOjo: OJO_NPC, suOjo: OJO_JUG, suColisionador: null, trazar: () => 99 }), false);
  });

  test("encima de él no hay rayo que tirar, y se ve", () => {
    let llamado = false;
    assert.equal(loVe({
      miOjo: OJO_NPC, suOjo: [...OJO_NPC], suColisionador: 7,
      trazar: () => { llamado = true; return 99; },
    }), true);
    assert.equal(llamado, false, "y no se ha tirado ningún rayo");
  });

  test("el rayo se le pide NORMALIZADO y con su largo, que es lo que Rapier quiere", () => {
    // El contrato con los dos mundos: `trazar(desde, direccionUnitaria, largo)`.
    // Si se les pasara el vector sin normalizar, el `maxToi` de Rapier mediría
    // en unidades de ese vector y el alcance saldría multiplicado por la
    // distancia — un rayo que atraviesa el pueblo. Es la frontera del 78.
    let visto = null;
    loVe({ miOjo: [0, 1, 0], suOjo: [3, 1, 4], suColisionador: 7,
      trazar: (desde, dir, largo) => { visto = { desde, dir, largo }; return null; } });
    assert.deepEqual(visto.desde, [0, 1, 0]);
    assert.equal(visto.largo, 5);                       // 3-4-5
    assert.ok(Math.abs(Math.hypot(...visto.dir) - 1) < 1e-12, "unitaria");
    assert.deepEqual(visto.dir.map((x) => Number(x.toFixed(6))), [0.6, 0, 0.8]);
  });
});

// ── EL CENSO: que los casos que se portan existan en un mapa de verdad ───────
//
// Esto es la defensa del 50 —un segundo caso— y la del 80 —«una lista de sondas
// que cubren una regla cubre los bichos con los que se escribieron»—. Se lee el
// horneado de los tres mapas y se CUENTA.
const MAPAS = ["edana", "gatecity", "gertenheld_forest2"];
const horneados = MAPAS.filter((m) => existsSync(join("build", m, "guiones.json")));

describe("el censo de `setmovedest` en los mapas horneados", { skip: !horneados.length }, () => {
  const recorrer = (cs, f) => {
    for (const c of cs ?? []) { f(c); recorrer(c.hijos, f); recorrer(c.sino, f); }
  };
  const censoDe = (mapa) => {
    const g = JSON.parse(readFileSync(join("build", mapa, "guiones.json"), "utf8")).guiones ?? {};
    const c = { total: 0, none: 0, punto: 0, huir: 0, girar: 0, unSolo: 0, guiones: 0, deCuantos: 0 };
    for (const v of Object.values(g)) {
      c.deCuantos++;
      let suyo = 0;
      for (const e of v.eventos ?? []) {
        recorrer(e.cmds, (cmd) => {
          if (String(cmd.nombre).toLowerCase() !== "setmovedest") return;
          const p = cmd.params ?? [];
          c.total++; suyo++;
          if (String(p[0]).toLowerCase() === "none") { c.none++; return; }
          if (p.length < 2) { c.unSolo++; return; }
          if (String(p[0]).startsWith("(")) c.punto++;
          if (p.slice(2).some((x) => String(x).toLowerCase().includes("flee"))) c.huir++;
          if (["999", "9999"].includes(String(p[1]))) c.girar++;
        });
      }
      if (suyo) c.guiones++;
    }
    return c;
  };

  test("Edana lo usa en casi todos sus guiones, y la mitad es para GIRAR", () => {
    const c = censoDe("edana");
    // No es un comando de adorno: es la mitad de lo que hacen los vecinos.
    assert.ok(c.total > 100, `Edana trae ${c.total}`);
    assert.ok(c.guiones >= c.deCuantos - 2, `lo usan ${c.guiones} de ${c.deCuantos}`);
    assert.ok(c.girar / c.total > 0.4, `girar es ${c.girar} de ${c.total}`);
    assert.ok(c.huir > 0, "y Edana tiene huidas");
    assert.ok(c.none > 0, "y `none`");
  });

  test("las tres formas que se portan tienen caso en los tres mapas", () => {
    for (const m of horneados) {
      const c = censoDe(m);
      assert.ok(c.total > 0, `${m} no trae ninguno`);
      assert.ok(c.huir > 0, `${m} no trae ninguna huida`);
      assert.ok(c.girar > 0, `${m} no trae ningún giro`);
    }
  });

  test("PENDIENTE declarado: la rama `(x y z)` no tiene caso en ningún mapa", () => {
    // Los tres mapas horneados traen CERO `setmovedest (x y z)`. La forma existe
    // —`monsters/base_npc_attack_new.script` y `mines/rudolf.script` la usan—
    // pero ninguno de esos guiones está colocado en los mapas que tenemos, así
    // que **el cambio de ejes no se puede medir en una partida**. Su control es
    // el de arriba, que le da texto al lector, y eso es legítimo porque el
    // mecanismo ES texto a números; lo que NO se puede decir es que esté medido
    // en el juego. Se declara aquí, con su número, en vez de contarse entre los
    // verdes (apartado 4 de CLAUDE.md, la variante del 50).
    const conPunto = horneados.map((m) => censoDe(m).punto);
    assert.deepEqual(conPunto, horneados.map(() => 0),
      "si esto se pone rojo, ya hay mapa donde medir el cambio de ejes: quítale el pendiente");
  });
});
