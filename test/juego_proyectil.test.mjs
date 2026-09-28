// El tiro con arco: cuánto tensa, por dónde sale, cómo vuela y cuánto duele.
// Todo lo que hay entre pulsar el botón y una flecha clavada en un goblin.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  GRAVEDAD, MIRA_ADELANTE, EXPIRA, COMO_EL_MOTOR, AJUSTES,
  fraccionTensada, velocidadDeSalida, conoDelTiro, anguloDelTiro,
  danoDeFlecha, dadoDeFlecha, Flecha,
} from "../src/play/proyectil.js";
import { Brazo, FASE } from "../src/play/golpe.js";

/** El arco de árbol, el gratis del personaje nuevo, tal como lo lee el lector. */
const ARCO = {
  tipo: "charge-throw-projectile", habilidad: "archery",
  alcance: 750, sostener: [1.1, 1.3], cono: [10, 4], apunta: [0, 9, 0],
  duracion: 0.3, retardo: null, aguante: 1, proyectil: "arrow",
  teclas: ["+attack1"], prioridad: 0, pideHabilidad: 0,
};
/** Y su flecha gratis. */
const FLECHA = { dano: { min: 30, max: 60 }, gravedad: 0.75, duraEnElSuelo: 5 };

describe("lo tensado que está el arco", () => {
  test("un clic seco NO es un tiro flojo: es el 85 % de la fuerza", () => {
    // `V_max(V_min(held, tMaxHold), tProjMinHold) / tMaxHold` — el mínimo es un
    // SUELO, no un requisito. 1,1/1,3.
    assert.equal(fraccionTensada(0, ARCO.sostener).toFixed(4), (1.1 / 1.3).toFixed(4));
    assert.equal(Math.round(velocidadDeSalida(ARCO, fraccionTensada(0, ARCO.sostener))), 635);
  });

  test("tensar del todo da el 100 %, y pasarse no da más", () => {
    assert.equal(fraccionTensada(1.3, ARCO.sostener), 1);
    assert.equal(fraccionTensada(30, ARCO.sostener), 1);
    assert.equal(velocidadDeSalida(ARCO, 1), 750);
  });

  test("un arco sin los dos tiempos dispara con fuerza CERO", () => {
    // `flTimeHeldAdjusted = tMaxHold ? (… / tMaxHold) : 0` — el ternario, tal
    // cual. La flecha sale a cero y cae a los pies; no da error en ningún sitio.
    assert.equal(fraccionTensada(5, null), 0);
    assert.equal(velocidadDeSalida(ARCO, fraccionTensada(5, null)), 0);
  });

  test("todo el sistema de carga del arco cabe en un 15 %", () => {
    const flojo = velocidadDeSalida(ARCO, fraccionTensada(0, ARCO.sostener));
    const lleno = velocidadDeSalida(ARCO, fraccionTensada(1.3, ARCO.sostener));
    assert.ok(flojo / lleno > 0.84 && flojo / lleno < 0.85);
  });
});

describe("el cono de dispersión", () => {
  test("el primer número del `COF` es el MALO", () => {
    // `10;4`: 10° sin tensar, 4° tensado. Al revés, el arco de árbol sería más
    // preciso que el largo.
    assert.equal(conoDelTiro(ARCO, 0), 10);
    assert.equal(conoDelTiro(ARCO, 1), 4);
  });

  test("sin tensar del todo el cono casi no baja", () => {
    // Con un clic (fracción 0,846) el cono es 4,92 y no 10: el mínimo ya se ha
    // comido casi toda la mejora.
    const c = conoDelTiro(ARCO, fraccionTensada(0, ARCO.sostener));
    assert.ok(c > 4.9 && c < 5.0, `${c}`);
  });

  test("la habilidad NO entra, y eso es el motor y no un olvido nuestro", () => {
    // `flAccFraction` se calcula en giattack.cpp:1078 y no se vuelve a usar.
    const cero = conoDelTiro(ARCO, 1, { habilidad: 0 });
    const cien = conoDelTiro(ARCO, 1, { habilidad: 100 });
    assert.equal(cero, cien);
    assert.equal(COMO_EL_MOTOR.punteriaPorHabilidad, false);
  });

  test("con el interruptor puesto, cien de arquería acierta en el centro", () => {
    const a = { punteriaPorHabilidad: true };
    assert.equal(conoDelTiro(ARCO, 1, { habilidad: 100, ajustes: a }), 0);
    assert.equal(conoDelTiro(ARCO, 1, { habilidad: 50, ajustes: a }), 2);
  });
});

describe("por dónde sale la flecha", () => {
  test("el desvío del arco va al GUIÑO, o sea de lado", () => {
    // `vAngle += AimOffset` con `RANGED_AIMANGLE (0,9,0)`, y vAngle es
    // (cabeceo, guiño, alabeo). Con el cono a cero para ver sólo el desvío.
    const recto = { ...ARCO, cono: [0, 0] };
    const r = anguloDelTiro({ cabeceo: 0, guino: 0, ataque: recto, sostenido: 1.3, azar: () => 0 });
    assert.equal(Math.round(r.guino), 9);
    assert.equal(Math.round(r.cabeceo), 0);
  });

  test("arreglado, los nueve grados suben el tiro en vez de torcerlo", () => {
    const recto = { ...ARCO, cono: [0, 0] };
    const r = anguloDelTiro({
      ataque: recto, sostenido: 1.3, azar: () => 0,
      ajustes: { ...COMO_EL_MOTOR, desvioEnElGuino: false },
    });
    assert.equal(Math.round(r.guino), 0);
    // Cabeceo negativo mira ARRIBA, que es lo que compensa la caída.
    assert.equal(Math.round(r.cabeceo), -9);
  });

  test("las ballestas no llevan desvío, y eso es la prueba de la intención", () => {
    // Las dos ballestas y todos los arcos posteriores a `bows_base` declaran
    // `(0,0,0)`: alguien apagó los nueve grados en vez de arreglarlos.
    const ballesta = { ...ARCO, apunta: [0, 0, 0], cono: [0, 0] };
    const r = anguloDelTiro({ ataque: ballesta, sostenido: 1.3, azar: () => 0 });
    assert.equal(r.guino, 0);
  });

  test("el veer es medio círculo: el guiño se desvía SIEMPRE al mismo lado", () => {
    // `RANDOM_FLOAT(0, M_PI)` y `sinf` de eso nunca es negativo.
    const recto = { ...ARCO, apunta: [0, 0, 0] };
    let negativos = 0;
    for (let i = 0; i < 100; i++) {
      const r = anguloDelTiro({ ataque: recto, sostenido: 1.3, azar: () => i / 100 });
      if (r.guino < -1e-9) negativos++;
    }
    assert.equal(negativos, 0);
  });

  test("y el radio es SIEMPRE el cono entero: ninguna flecha sale por el centro", () => {
    const recto = { ...ARCO, apunta: [0, 0, 0] };
    for (const a of [0.01, 0.3, 0.7, 0.99]) {
      const r = anguloDelTiro({ ataque: recto, sostenido: 1.3, azar: () => a });
      assert.equal(Math.hypot(r.cabeceo, r.guino).toFixed(6), (4).toFixed(6));
    }
  });

  test("arreglado, el desvío cae dentro del disco y a los dos lados", () => {
    const recto = { ...ARCO, apunta: [0, 0, 0] };
    const ajustes = { ...COMO_EL_MOTOR, veerDeMedioCirculo: false };
    let negativos = 0, dentro = 0;
    // Un `azar` determinista que no repita valor en las dos tiradas.
    let n = 0;
    const azar = () => { n += 1; return (n * 0.37) % 1; };
    for (let i = 0; i < 200; i++) {
      const r = anguloDelTiro({ ataque: recto, sostenido: 1.3, azar, ajustes });
      if (r.guino < 0) negativos++;
      if (Math.hypot(r.cabeceo, r.guino) < 3.99) dentro++;
    }
    assert.ok(negativos > 50, `${negativos} desvíos al otro lado`);
    assert.ok(dentro > 50, `${dentro} dentro del disco`);
  });

  test("los ajustes arrancan siendo los del motor", () => {
    // El proyecto porta el juego, no una versión mejorada del juego. Si alguien
    // cambia esto, que sea a mano y a la vista.
    assert.deepEqual({ ...AJUSTES }, { ...COMO_EL_MOTOR });
  });
});

describe("el daño de una flecha", () => {
  test("es el de la FLECHA, por la potencia, y nada más", () => {
    assert.equal(danoDeFlecha({ dado: 45, potencia: 100 }), 45);
    assert.equal(danoDeFlecha({ dado: 45, potencia: 50 }), 22.5);
  });

  test("un personaje nuevo hace medio punto de daño con la flecha gratis", () => {
    // Un punto de potencia: `V_max(1/100, 0.001)`. La flecha gratis hace 30 a 60,
    // o sea 0,3 a 0,6. Es el mismo modelo de progresión del mandoble, y explica
    // por qué el arco de partida parece roto.
    const d = danoDeFlecha({ dado: 45, potencia: 1 });
    assert.ok(d > 0.44 && d < 0.46, `${d}`);
  });

  test("el multiplicador del ARCO entra, y entra al nacer la flecha", () => {
    assert.equal(danoDeFlecha({ dado: 100, potencia: 100, multiplicadorDelArco: 2 }), 200);
    // Sin multiplicador declarado el lector deja `null`, y eso no es un cero.
    assert.equal(danoDeFlecha({ dado: 100, potencia: 100, multiplicadorDelArco: 0 }), 100);
  });

  test("el dado de la flecha tiene decimales, al contrario que el del mandoble", () => {
    // El mandoble usa `RANDOM_LONG` y sale entero; la flecha viene de
    // `$rand(30,60)` del script y no pasa por ahí.
    const d = dadoDeFlecha(FLECHA.dano, () => 0.5);
    assert.equal(d, 45);
    assert.ok(!Number.isInteger(dadoDeFlecha(FLECHA.dano, () => 0.51)));
  });
});

describe("la flecha en el aire", () => {
  const recta = (velocidad = 750, gravedad = 0.75) => new Flecha({
    desde: [0, 0, 0], hacia: [0, 0, -1], velocidad, gravedad,
  });

  test("cae con la gravedad de la FLECHA y no con la del mundo", () => {
    const f = recta();
    f.paso(1, { traza: null });
    assert.equal(f.vel[1], -0.75 * GRAVEDAD);
    // Y la del mundo son 800: leerlo como «la gravedad es 800» da un 33 % más
    // de caída.
    assert.notEqual(f.vel[1], -GRAVEDAD);
  });

  test("la gravedad se aplica ANTES de mover, como `SV_Physics_Toss`", () => {
    const f = recta();
    f.paso(0.05, { traza: null });
    // Si moviera antes, la altura del primer paso sería 0.
    assert.ok(f.pos[1] < 0, `${f.pos[1]}`);
    assert.equal(f.pos[1].toFixed(3), (-0.75 * GRAVEDAD * 0.05 * 0.05).toFixed(3));
  });

  test("a veinte metros la flecha del arco de árbol ha caído OCHO metros", () => {
    // 20 m son 787 unidades y la flecha tarda 1,05 s en llegar: media gravedad
    // por el cuadrado del tiempo son 330 unidades, o sea 8,4 metros. Escribí
    // «metro y medio» de cabeza y me lo corrigió el número: 750 u/s son 19 m/s,
    // que es un tercio de la velocidad de una flecha de verdad, y 600 u/s² son
    // 15 m/s², que es una gravedad y media. El arco de árbol no es un arco de
    // precisión: es una catapulta de mano.
    const f = recta();
    let caida = 0;
    for (let i = 0; i < 400 && -f.pos[2] < 787; i++) { f.paso(1 / 60, { traza: null }); caida = f.pos[1]; }
    assert.ok(caida < -300 && caida > -360, `${caida} unidades`);
  });

  test("y los grados que declara cada arco son JUSTO la compensación de esa caída", () => {
    // Éste es el control que convierte «creo que el desvío iba en el cabeceo» en
    // un dato. Si los grados del `RANGED_AIMANGLE` fueran el cabeceo, cada arco
    // volvería a la altura del ojo a un alcance razonable **para ese arco**:
    //
    //     R = v² · sen(2θ) / g
    //
    // arco de árbol   750 u/s, 9° -> 290 u  = 7,4 m
    // arco largo     2100 u/s, 3° -> 768 u  = 19,5 m
    //
    // Siete metros el arco corto de bark y leaves, veinte el largo «made for
    // range». Eso no es una casualidad de dos cifras: es el diseño. Y en el
    // guiño esos mismos grados no compensan nada — desvían de lado.
    const alcanceLlano = (v, grados, g = 0.75 * GRAVEDAD) =>
      (v * v * Math.sin(2 * grados * Math.PI / 180)) / g;
    const arbol = alcanceLlano(750, 9);
    const largo = alcanceLlano(2100, 3);
    assert.ok(arbol > 270 && arbol < 310, `${arbol} u`);
    assert.ok(largo > 730 && largo < 810, `${largo} u`);
    assert.ok(largo / arbol > 2.4, "el largo tiene que llegar mucho más lejos");
  });

  test("mira 36 unidades adelante, y por eso acierta antes de tocar", () => {
    // `Projectile_CheckHit` traza `origin + velocity.Normalize() * 36`. Es la
    // defensa del motor contra colarse por dentro de un bicho a 750 u/s.
    const f = recta();
    const visto = [];
    const traza = (a, b) => { visto.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); return null; };
    f.paso(1 / 60, { traza });
    // Dos trazas: el barrido del paso y el rayo de 36.
    assert.equal(visto.length, 2);
    assert.ok(visto[0] > 12 && visto[0] < 13, `barrido ${visto[0]}`);
    assert.equal(Math.round(visto[1]), MIRA_ADELANTE);
  });

  test("una flecha disparada contra una pared pegada choca en el paso CERO", () => {
    // `Think(); //Check the first frame` al final de `TossProjectile`.
    const f = recta();
    const g = f.nacer(() => ({ punto: [0, 0, -20], contra: "pared" }));
    assert.ok(g);
    assert.equal(f.volando, false);
    assert.deepEqual(f.pos, [0, 0, -20]);
  });

  test("al chocar se para en el punto del choque y se queda quieta", () => {
    const f = recta();
    f.paso(1 / 60, { traza: null });
    const g = f.paso(1 / 60, { traza: () => ({ punto: [1, 2, -3], contra: "goblin" }) });
    assert.equal(g.contra, "goblin");
    assert.deepEqual(f.pos, [1, 2, -3]);
    assert.equal(f.rapidez, 0);
    // Y ya no vuelve a trazar nada.
    let trazas = 0;
    f.paso(1 / 60, { traza: () => { trazas++; return null; } });
    assert.equal(trazas, 0);
  });

  test("dos relojes: 120 segundos en el aire, cinco clavada", () => {
    const volando = recta();
    volando.vida = EXPIRA - 0.1;
    assert.equal(volando.caducada, false);
    volando.paso(0.2, { traza: null });
    assert.equal(volando.caducada, true);

    const clavada = new Flecha({ velocidad: 750, expira: 5 });
    clavada.paso(0.1, { traza: () => ({ punto: [0, 0, 0], contra: "suelo" }) });
    for (let i = 0; i < 101; i++) clavada.paso(0.05, {});
    assert.ok(clavada.enElSuelo > 5 && clavada.enElSuelo < 5.2, `${clavada.enElSuelo}`);
    assert.equal(clavada.caducada, true);
  });
});

describe("el brazo con un arco en la mano", () => {
  const DT = 1 / 60;
  const brazoDeArco = () => new Brazo({ ataques: [ARCO, { ...ARCO }], animaciones: { ataque: [] } });

  test("un arco es de tiro y trae sus dos ataques CLONADOS", () => {
    const b = brazoDeArco();
    assert.equal(b.esDeTiro, true);
    assert.equal(b.ataques.length, 2);
    assert.deepEqual(b.ataques[0].sostener, b.ataques[1].sostener);
  });

  test("aguantar el botón NO dispara nunca, por mucho que se aguante", () => {
    // Lo primero que escribí fue «a los 1,3 s sale la flecha». No: la suelta la
    // manda el cliente al levantar el botón, y con el botón abajo no hay suelta.
    const b = brazoDeArco();
    let tiros = 0;
    for (let t = 0; t < 30; t += DT) if (b.tic(DT, { pulsado: true }).tira) tiros++;
    assert.equal(tiros, 0);
    assert.equal(b.fase, FASE.TENSANDO);
    assert.ok(b.t > 29);
  });

  test("un clic seco dispara 1,1 s después, solo", () => {
    const b = brazoDeArco();
    b.tic(DT, { pulsado: true });      // el clic
    let cuando = null;
    for (let t = 0; t < 3; t += DT) {
      const e = b.tic(DT, { pulsado: false });
      if (e.tira) { cuando = b.t; break; }
    }
    assert.ok(cuando !== null, "no ha disparado");
    assert.ok(cuando >= 1.1 && cuando < 1.13, `a los ${cuando} s`);
  });

  test("soltar después del mínimo dispara en el paso de la suelta", () => {
    const b = brazoDeArco();
    b.tic(DT, { pulsado: true });
    for (let t = 0; t < 2; t += DT) b.tic(DT, { pulsado: true });
    const e = b.tic(DT, { pulsado: false });
    assert.ok(e.tira);
    assert.ok(e.sostenido > 2);
  });

  test("tensar cuenta como atacar, o sea que corta el trote", () => {
    const b = brazoDeArco();
    b.tic(DT, { pulsado: true });
    assert.equal(b.atacando, true);
  });

  test("el retardo de después del tiro no retrasa nada", () => {
    // `RANGED_POSTFIRE_DELAY` 0,3 se mide desde que empezaste a tensar y ya han
    // pasado 1,1: el arco queda libre al paso siguiente.
    const b = brazoDeArco();
    b.tic(DT, { pulsado: true });
    let paso = 0, disparado = false;
    for (let t = 0; t < 3; t += DT) {
      const e = b.tic(DT, { pulsado: false });
      if (e.tira) disparado = true;
      else if (disparado) { paso++; if (e.acaba) break; }
    }
    assert.equal(paso, 1);
    assert.equal(b.fase, FASE.QUIETO);
  });

  test("la barra de tensado va de cero a uno y se queda ahí", () => {
    const b = brazoDeArco();
    // El paso en que empieza no avanza el reloj: `tStart` es el instante de
    // ahora, igual que en el mandoble.
    b.tic(DT, { pulsado: true });
    assert.equal(b.tensado, 0);
    b.tic(DT, { pulsado: true });
    assert.ok(b.tensado > 0 && b.tensado < 0.05, `${b.tensado}`);
    for (let t = 0; t < 1.3; t += DT) b.tic(DT, { pulsado: true });
    assert.equal(b.tensado, 1);
  });

  test("y una espada sigue siendo una espada", () => {
    // El brazo tiene dos máquinas y la del mandoble no se ha tocado.
    const espada = new Brazo({
      ataques: [{ tipo: "strike-land", teclas: ["+attack1"], dano: 90, danoRango: 50, retardo: 0.6, duracion: 1.1 }],
      animaciones: { ataque: [1] },
    });
    assert.equal(espada.esDeTiro, false);
    assert.ok(espada.tic(DT, { pulsado: true }).empieza);
  });
});
