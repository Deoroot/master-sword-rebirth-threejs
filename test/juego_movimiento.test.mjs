// El modelo de movimiento de Master Sword, comprobado contra sus propias
// fórmulas y contra lo que esas fórmulas prometen.
//
// Varias de estas comprobaciones traen su CONTROL NEGATIVO al lado, y no por
// ceremonia: la mitad de este archivo son asimetrías que parecen erratas
// —correr hacia atrás a la mitad, el tope de 30 sólo en un sitio, el `int` que
// trunca— y que si alguien «limpia» no dan ningún error. Dan otro juego.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  MOVEVARS, CAJA, ALTURA_DE_SALTO, velocidadDeSalto, VELOCIDAD, EJES,
  velocidadAndando, velocidadCorriendo, ajustarVelocidad, PENALIZACION_FLECHA,
  AGUANTE_CORRIENDO, regeneracionDeAguante, aguanteDeSalto,
  CAIDA, danoDeCaida, friccion, acelerar, acelerarEnAire, TOPE_EN_AIRE,
  deseo, puedeCorrer, pasoDeVelocidad, avisoDeCarrera,
  nivelDeAgua, nadar, trepar, normalDeEscalera, SALTO_DESDE_ESCALERA,
} from "../src/play/movimiento.js";

const DT = 1 / 60;

/** Aguanta pulsada una intención hasta que la velocidad deja de subir. */
function terminal(intencion, { maxima = 160, yaw = 0, pasos = 600 } = {}) {
  let v = [0, 0, 0];
  for (let i = 0; i < pasos; i++) {
    v = pasoDeVelocidad(v, { intencion, yaw, maxima, dt: DT, enSuelo: true }).velocidad;
  }
  return Math.hypot(v[0], v[2]);
}

/** Salta y devuelve a qué altura llega, integrando como lo haría el visor. */
function alturaDeSalto(dt) {
  let { velocidad: v, mover } = pasoDeVelocidad([0, 0, 0], { dt, enSuelo: true, saltar: true });
  let alto = mover[1];
  for (let i = 0; i < 10000; i++) {
    const r = pasoDeVelocidad(v, { dt, enSuelo: false });
    if (r.mover[1] <= 0) break;
    alto += r.mover[1];
    v = r.velocidad;
  }
  return alto;
}

test("las constantes son las del motor, no las de Quake", () => {
  // Éstas son las cadenas que `sv_main.c` registra como valor inicial.
  assert.equal(MOVEVARS.gravedad, 800);
  assert.equal(MOVEVARS.velocidadDeParada, 100);
  assert.equal(MOVEVARS.aceleracion, 10);
  assert.equal(MOVEVARS.aceleracionEnAire, 10);
  assert.equal(MOVEVARS.rozamiento, 4);
  assert.equal(MOVEVARS.rozamientoDeBorde, 2);
  assert.equal(MOVEVARS.velocidadMaxima, 2000);
  // DIECIOCHO. El valor que teníamos era 16, que es el de Quake.
  assert.equal(MOVEVARS.escalon, 18);
});

test("la caja del jugador, de util.h", () => {
  assert.equal(CAJA.ancho, 32);
  assert.equal(CAJA.alto, 72);
  // 36 + 28, no 28. El origen está en el centro de la caja.
  assert.equal(CAJA.ojo, 64);
  assert.equal(CAJA.altoAgachado, 36);
  assert.equal(CAJA.ojoAgachado, 30);
});

test("el salto sube exactamente sus 45 unidades", (t) => {
  assert.equal(velocidadDeSalto(), Math.sqrt(2 * 800 * 45));
  assert.ok(Math.abs(velocidadDeSalto() - 268.328) < 0.01, `${velocidadDeSalto()}`);

  // Y la promesa de la fórmula: simulando la subida se llega a 45 unidades.
  // Esto no comprueba la constante, comprueba que la INTEGRACIÓN la respeta —
  // que es donde una gravedad mal aplicada se nota y no da error.
  const alto = alturaDeSalto(DT);
  assert.ok(Math.abs(alto - ALTURA_DE_SALTO) < 0.1, `ha subido ${alto.toFixed(2)} y tenían que ser 45`);
});

test("y sube lo mismo a 20, 60 o 240 fotogramas por segundo", () => {
  // Ésta es la razón de partir la gravedad en dos mitades, y el control de que
  // está partida. Con la gravedad entera antes de mover —Euler a secas— el
  // salto sube 42,6 a 60 Hz y **39 a 20 Hz**: el jugador salta más alto en un
  // equipo mejor. No da error, da un juego distinto según la máquina.
  const alturas = [1 / 20, 1 / 60, 1 / 144, 1 / 240].map(alturaDeSalto);
  for (const a of alturas) {
    assert.ok(Math.abs(a - ALTURA_DE_SALTO) < 0.1, `${a.toFixed(3)} a una tasa distinta`);
  }
  // Queda una diferencia de una décima de unidad —**medio milímetro**— entre
  // 20 y 240 Hz, y no es del método: es el último paso, que cruza el punto
  // más alto a medias. Contra los 2,5 de Euler, es otra cosa.
  const recorrido = Math.max(...alturas) - Math.min(...alturas);
  assert.ok(recorrido < 0.1, `entre la tasa más baja y la más alta hay ${recorrido.toFixed(4)}`);

  // El control negativo: con Euler a secas, el recorrido entre tasas es
  // grande. Si esta simulación diera también algo pequeño, la de arriba no
  // estaría demostrando nada.
  const euler = (dt) => {
    let v = velocidadDeSalto(), alto = 0;
    while (v > 0) { v -= MOVEVARS.gravedad * dt; alto += Math.max(v, 0) * dt; }
    return alto;
  };
  const malas = [1 / 20, 1 / 240].map(euler);
  assert.ok(Math.abs(malas[0] - malas[1]) > 1,
    `con Euler la diferencia entre 20 y 240 Hz es ${Math.abs(malas[0] - malas[1]).toFixed(2)} unidades`);
});

test("la velocidad de un personaje: WalkSpeed()", async (t) => {
  await t.test("sin agilidad y sin peso, la base", () => {
    assert.equal(velocidadAndando({ agilidad: 0, peso: 0, carga: 1000 }), 160);
  });

  await t.test("75 de agilidad suman exactamente 100 — «75 dex adds 100 to speed»", () => {
    assert.equal(velocidadAndando({ agilidad: 75, peso: 0, carga: 1000 }), 260);
    assert.equal(velocidadAndando({ agilidad: 37.5, peso: 0, carga: 1000 }), 210);
  });

  await t.test("y SATURA: de 75 en adelante no se gana nada", () => {
    const a = velocidadAndando({ agilidad: 75, peso: 0, carga: 1000 });
    const b = velocidadAndando({ agilidad: 300, peso: 0, carga: 1000 });
    assert.equal(a, b);
    // El control: si no saturara, 300 de agilidad daría 560. Que esto NO pase
    // es la mitad del diseño — la agilidad deja de servir para correr.
    assert.notEqual(b, VELOCIDAD.base + (300 / 75) * 100);
  });

  await t.test("el peso no estorba hasta la MITAD de lo que cargas", () => {
    const libre = velocidadAndando({ agilidad: 0, peso: 0, carga: 200 });
    for (const peso of [1, 50, 99, 100]) {
      assert.equal(velocidadAndando({ agilidad: 0, peso, carga: 200 }), libre,
        `con ${peso} de 200 no debería frenar`);
    }
  });

  await t.test("y a partir de ahí baja hasta 70, ni uno más", () => {
    // A tope de carga: peso 200 de 200 → detriment = (200-100)/100*70 = 70.
    assert.equal(velocidadAndando({ agilidad: 0, peso: 200, carga: 200 }), 90);
    // Pasado el tope no sigue bajando: el `V_min` lo corta.
    assert.equal(velocidadAndando({ agilidad: 0, peso: 10000, carga: 200 }), 90);
    // Justo a la mitad del tramo, la mitad del castigo.
    assert.equal(velocidadAndando({ agilidad: 0, peso: 150, carga: 200 }), 160 - 35);
  });

  await t.test("carga cero no divide por cero", () => {
    // No pasa en el juego —`Volume()` arranca en 25— pero si pasara, un NaN
    // aquí deja al jugador clavado y nada lo dice.
    const v = velocidadAndando({ agilidad: 0, peso: 10, carga: 0 });
    assert.ok(Number.isFinite(v), `${v}`);
  });
});

test("correr es una rampa sobre el aguante, no un interruptor", async (t) => {
  await t.test("a tope de aguante se corre al DOBLE", () => {
    assert.equal(velocidadCorriendo(160, { aguante: 10, aguanteMax: 10 }), 320);
  });

  await t.test("a la mitad, un 50 % más", () => {
    assert.equal(velocidadCorriendo(160, { aguante: 5, aguanteMax: 10 }), 240);
  });

  await t.test("y sin aguante, correr no corre", () => {
    const v = velocidadCorriendo(160, { aguante: 0, aguanteMax: 10 });
    assert.ok(Math.abs(v - 160) < 0.1, `${v}`);
  });
});

test("los dos castigos de ParseSpeed()", async (t) => {
  await t.test("una flecha clavada quita 60", () => {
    assert.equal(ajustarVelocidad(260, { flechasClavadas: 1 }), 200);
    assert.equal(PENALIZACION_FLECHA, 60);
  });

  await t.test("y CINCO quitan lo mismo que una", () => {
    // `if (ArrowsStuckInMe > 0) Speed -= 60;` — es una comprobación, no una
    // cuenta. Multiplicarlo por el número de flechas sería «arreglarlo».
    assert.equal(ajustarVelocidad(260, { flechasClavadas: 5 }), 200);
  });

  await t.test("atacando se va a la mitad, y se aplica DESPUÉS de la flecha", () => {
    assert.equal(ajustarVelocidad(260, { atacando: true }), 130);
    assert.equal(ajustarVelocidad(260, { flechasClavadas: 1, atacando: true }), 100);
    // El control del orden: si se aplicara antes, saldría (260*0.5)-60 = 70.
    assert.notEqual(ajustarVelocidad(260, { flechasClavadas: 1, atacando: true }), 70);
  });
});

test("el aguante", async (t) => {
  await t.test("correr cuesta 0,6 por segundo", () => {
    assert.equal(AGUANTE_CORRIENDO, 0.6);
  });

  await t.test("y se recupera a 0,6 + Fuerza/10", () => {
    assert.equal(regeneracionDeAguante(0), 0.6);
    assert.ok(Math.abs(regeneracionDeAguante(30) - 3.6) < 1e-9);
    // Con 0 de fuerza, recuperar cuesta exactamente lo mismo que gastar: se
    // corre la mitad del tiempo. Con 30, seis veces más rápido de lo que se
    // gasta. Ése es el papel de la Fuerza en la carrera.
    assert.equal(regeneracionDeAguante(0), AGUANTE_CORRIENDO);
  });

  await t.test("saltar es GRATIS con la mochila a menos de un cuarto", () => {
    // `int JumpEnergy = min(Weight/Volume,1) * 4` — trunca.
    assert.equal(aguanteDeSalto({ peso: 0, carga: 400 }), 0);
    assert.equal(aguanteDeSalto({ peso: 99, carga: 400 }), 0);
    assert.equal(aguanteDeSalto({ peso: 100, carga: 400 }), 1);
    assert.equal(aguanteDeSalto({ peso: 400, carga: 400 }), 4);
    // Y no pasa de 4 por mucho que se cargue.
    assert.equal(aguanteDeSalto({ peso: 9999, carga: 400 }), 4);
  });
});

test("la caída", async (t) => {
  await t.test("hasta 580 no duele", () => {
    assert.equal(danoDeCaida(0), 0);
    assert.equal(danoDeCaida(579), 0);
    assert.equal(danoDeCaida(CAIDA.seguro), 0);
  });

  await t.test("y a 1024 son 100 exactos", () => {
    assert.ok(Math.abs(danoDeCaida(CAIDA.mortal) - 100) < 1e-9, `${danoDeCaida(1024)}`);
  });

  await t.test("cien puntos matan a casi cualquiera, y eso importa", () => {
    // Un personaje nuevo tiene 15 de vida (`MaxHP = 5 + …` con los atributos
    // a uno). O sea que la «caída mortal» del motor no necesita un caso
    // especial: mata porque 100 es mucho.
    assert.ok(danoDeCaida(CAIDA.mortal) > 15);
    // Lo interesante es lo otro: ¿desde qué velocidad muere un novato?
    const mata = CAIDA.seguro + 15 / (100 / (CAIDA.mortal - CAIDA.seguro));
    assert.ok(mata > CAIDA.seguro && mata < CAIDA.mortal, `${mata}`);
    // A 800 u/s ya está muerto, y 800 u/s son 20 m de caída.
    assert.ok(danoDeCaida(800) > 15);
  });
});

test("el rozamiento", async (t) => {
  await t.test("para de verdad, y en poco tiempo", () => {
    let v = [160, 0, 0];
    let pasos = 0;
    while (Math.hypot(v[0], v[2]) > 0.1 && pasos < 1000) {
      v = friccion(v, DT, { enSuelo: true });
      pasos++;
    }
    assert.ok(pasos < 120, `ha tardado ${pasos} pasos, o sea ${(pasos * DT).toFixed(2)} s`);
    assert.ok(Math.hypot(v[0], v[2]) <= 0.1);
  });

  await t.test("y es el suelo de stopspeed lo que lo consigue", () => {
    // El control: con `control = speed` en vez de `max(speed, stopspeed)` el
    // frenado es proporcional, o sea exponencial, o sea que NUNCA llega a
    // cero. El jugador patina para siempre a velocidad diminuta y en pantalla
    // eso parece un bicho, no un fallo de fricción.
    let v = 160;
    for (let i = 0; i < 1000; i++) v = Math.max(v - v * MOVEVARS.rozamiento * DT, 0);
    assert.ok(v > 0, "sin el suelo de stopspeed nunca llega a cero — y llega");
    assert.ok(v < 0.001, `y sin embargo es diminuto: ${v}`);
  });

  await t.test("al borde de un precipicio frena el doble", () => {
    const normal = friccion([160, 0, 0], DT, { enSuelo: true, alBorde: false })[0];
    const borde = friccion([160, 0, 0], DT, { enSuelo: true, alBorde: true })[0];
    assert.ok(borde < normal, `${borde} debería ser menor que ${normal}`);
    // El doble de pérdida, exacto.
    assert.ok(Math.abs((160 - borde) - 2 * (160 - normal)) < 1e-9);
  });

  await t.test("en el aire no hay rozamiento", () => {
    assert.deepEqual(friccion([160, 0, 0], DT, { enSuelo: false }), [160, 0, 0]);
  });
});

test("los tres ejes: andar hacia atrás va a la MITAD", async (t) => {
  await t.test("las constantes son las de CheckSpeed()", () => {
    assert.equal(EJES.adelante, 1.0);
    assert.equal(EJES.atras, 0.5);
    assert.equal(EJES.lado, 0.8);
  });

  await t.test("y se nota en la velocidad que se alcanza", () => {
    const alante = terminal({ adelante: 1 });
    const atras = terminal({ adelante: -1 });
    const lado = terminal({ lado: 1 });
    assert.ok(Math.abs(alante - 160) < 1, `${alante}`);
    assert.ok(Math.abs(atras - 80) < 1, `${atras}`);
    assert.ok(Math.abs(lado - 128) < 1, `${lado}`);
    // La razón exacta, que es la que cambia el combate: retroceder de un
    // monstruo cuesta el doble de tiempo que avanzar hacia él.
    assert.ok(Math.abs(atras / alante - 0.5) < 0.02);
  });

  await t.test("la diagonal NO es más rápida", () => {
    const alante = terminal({ adelante: 1 });
    const diagonal = terminal({ adelante: 1, lado: 1 });
    // `wishspeed` se topa a `maxspeed`. Sin ese tope la diagonal daría
    // sqrt(1² + 0,8²) = 1,28 veces más, que es el viejo «strafe running».
    assert.ok(Math.abs(diagonal - alante) < 1, `diagonal ${diagonal} contra ${alante}`);
  });

  await t.test("y el rumbo gira el movimiento, no lo cambia de tamaño", () => {
    for (const yaw of [0, Math.PI / 4, Math.PI / 2, 2.7, -1.3]) {
      const v = terminal({ adelante: 1 }, { yaw });
      assert.ok(Math.abs(v - 160) < 1, `a yaw ${yaw.toFixed(2)} sale ${v.toFixed(1)}`);
    }
  });

  await t.test("y apunta a donde mira", () => {
    // Con yaw 0 se mira a −Z, que es el convenio de `player.js`.
    const { dir } = deseo({ adelante: 1 }, 0, 160);
    assert.ok(Math.abs(dir[0]) < 1e-9 && Math.abs(dir[2] + 1) < 1e-9, JSON.stringify(dir));
    // Y a 90° a la izquierda se mira a −X.
    const g = deseo({ adelante: 1 }, Math.PI / 2, 160);
    assert.ok(Math.abs(g.dir[0] + 1) < 1e-9 && Math.abs(g.dir[2]) < 1e-9, JSON.stringify(g.dir));
  });
});

test("la aceleración en el AIRE y su asimetría", async (t) => {
  await t.test("en el aire sólo se puede ganar hasta 30 de frente", () => {
    let v = [0, 0, 0];
    for (let i = 0; i < 600; i++) v = acelerarEnAire(v, [0, 0, -1], 160, MOVEVARS.aceleracionEnAire, DT);
    assert.ok(Math.abs(Math.hypot(v[0], v[2]) - TOPE_EN_AIRE) < 0.5, `${Math.hypot(v[0], v[2])}`);
    assert.equal(TOPE_EN_AIRE, 30);
  });

  await t.test("y lo que cambia la asimetría es CUÁNTO se añade por paso", () => {
    // Ésta es la versión «limpia»: el 30 topado en los dos sitios. Igualarlos
    // no da ningún error, y cambia el tacto.
    const simetrico = (vel, dir, deseada, accel, dt) => {
      const d = Math.min(deseada, TOPE_EN_AIRE);
      const actual = vel[0] * dir[0] + vel[2] * dir[2];
      const falta = d - actual;
      if (falta <= 0) return [...vel];
      const paso = Math.min(accel * d * dt, falta);   // ← el topado también aquí
      return [vel[0] + paso * dir[0], vel[1], vel[2] + paso * dir[2]];
    };

    // Un solo paso desde parado, que es donde se ve sin ruido:
    //     con asimetría   accel × 160 × dt = 26,67, topado por `falta` = 30
    //     sin ella        accel ×  30 × dt =  5
    const dir = [0, 0, -1];
    const conAsimetria = -acelerarEnAire([0, 0, 0], dir, 160, MOVEVARS.aceleracionEnAire, DT)[2];
    const sinElla = -simetrico([0, 0, 0], dir, 160, MOVEVARS.aceleracionEnAire, DT)[2];
    assert.ok(Math.abs(conAsimetria - 160 * 10 * DT) < 1e-9, `${conAsimetria}`);
    assert.ok(Math.abs(sinElla - 30 * 10 * DT) < 1e-9, `${sinElla}`);
    assert.ok(conAsimetria > sinElla * 5, `${conAsimetria.toFixed(2)} contra ${sinElla.toFixed(2)}`);

    // Y el porqué de medirlo en UN paso y no en trescientos: en trescientos
    // las dos versiones llegan al mismo sitio. La primera versión de este
    // control corría 200 pasos y daba **el mismo número con las dos**, porque
    // ambas convergen al punto fijo `dot(v, dir) = 30` y lo único que cambia
    // es lo que se tarda en llegar. Nadie pasa 3,3 s en el aire: un salto de
    // 45 unidades dura 0,67 s. Medido en 3,3 s, la asimetría «no existe».
    const maniobra = (fn, pasos) => {
      let v = [0, 0, 0];
      for (let i = 0; i < pasos; i++) v = fn(v, dir, 160, MOVEVARS.aceleracionEnAire, DT);
      return -v[2];
    };
    assert.ok(Math.abs(maniobra(acelerarEnAire, 300) - maniobra(simetrico, 300)) < 0.01,
      "en trescientos pasos empatan, y por eso no se mide así");

    // Lo que la asimetría compra, medido: **cuántos pasos se tarda en tener
    // control en el aire**. Es tres veces más rápido, y en un salto de 40
    // pasos eso es la diferencia entre poder corregir y no llegar a tiempo.
    const pasosHasta30 = (fn) => {
      let v = [0, 0, 0];
      for (let i = 1; i <= 100; i++) {
        v = fn(v, dir, 160, MOVEVARS.aceleracionEnAire, DT);
        if (-v[2] >= TOPE_EN_AIRE - 1e-9) return i;
      }
      return Infinity;
    };
    const rapido = pasosHasta30(acelerarEnAire);
    const lento = pasosHasta30(simetrico);
    assert.equal(rapido, 2);
    assert.equal(lento, 6);
    assert.ok(rapido * 3 <= lento, `${rapido} pasos contra ${lento}`);
  });
});

test("PM_Accelerate sólo rellena lo que falta", async (t) => {
  await t.test("yendo ya a tope en esa dirección no acelera", () => {
    const v = acelerar([0, 0, -160], [0, 0, -1], 160, 10, DT);
    assert.deepEqual(v, [0, 0, -160]);
  });

  await t.test("pero yendo a tope hacia OTRO lado, sí", () => {
    // Es la proyección con el producto escalar, y es lo que hace que girar en
    // marcha responda en vez de tener que frenar primero.
    const v = acelerar([160, 0, 0], [0, 0, -1], 160, 10, DT);
    assert.ok(v[2] < 0, `debería haber empezado a ir a −Z: ${JSON.stringify(v)}`);
  });
});

// Las cinco frases de `DoSprint`, que el 63 echó de menos en una captura del
// juego: el HUD de MSR va diciendo «You break into a jog.» y «You slow down and
// begin walking casually.» todo el rato, y aquí la consola estaba muda.
//
// LO QUE SE COMPRUEBA NO ES QUE HAYA TEXTO: es que el MOTIVO es el correcto.
// Un aviso que diga «te has cansado» cuando has chocado es peor que ninguno, y
// el orden en que el mod los decide —aguante, frenazo, soltar— es justo lo que
// decide cuál sale.
test("lo que el juego dice al trotar y al dejar de trotar (63)", async (t) => {
  const corriendo = { corriendoAntes: true, corriendoAhora: false, aguante: 10, adelante: 1 };

  await t.test("arrancar y parar, las dos del trote", () => {
    assert.equal(avisoDeCarrera({ corriendoAntes: false, corriendoAhora: true })?.texto,
      "You break into a jog.");
    assert.equal(avisoDeCarrera(corriendo)?.texto,
      "You slow down and begin walking casually.");
  });

  await t.test("y quedarse quieto o seguir corriendo no dice nada", () => {
    assert.equal(avisoDeCarrera({ corriendoAntes: false, corriendoAhora: false }), null);
    assert.equal(avisoDeCarrera({ corriendoAntes: true, corriendoAhora: true }), null);
  });

  await t.test("los tres «no puedes», cada uno por su motivo", () => {
    // Pedir carrera sin aguante: `Stamina <= 1`, clplayer.cpp:348.
    assert.deepEqual(avisoDeCarrera({ corriendoAntes: false, corriendoAhora: false,
      pulsaCorrer: true, adelante: 1, aguante: 1 }),
      { tipo: "nopuedes", texto: "You are too exhausted to run." });
    // Quedarse sin aguante EN MARCHA es otra frase, :357.
    assert.equal(avisoDeCarrera({ ...corriendo, aguante: 0 })?.texto,
      "You are too exhausted to continue running.");
    // Y chocar es la tercera, :373 — el frenazo de 50 unidades.
    assert.equal(avisoDeCarrera({ ...corriendo, rapidez: 100, rapidezAnterior: 200 })?.texto,
      "You lose your running speed.");
    assert.equal(avisoDeCarrera({ ...corriendo, agachado: true })?.texto,
      "You lose your running speed.");
  });

  await t.test("el orden importa: sin aguante Y chocando gana el aguante", () => {
    // Es el orden del mod (:352 antes que :366). Si se invirtiera, un jugador
    // exhausto que además choca leería «You lose your running speed.» y
    // seguiría sin saber por qué no puede volver a arrancar.
    assert.equal(avisoDeCarrera({ ...corriendo, aguante: 0, rapidez: 100, rapidezAnterior: 200 })?.texto,
      "You are too exhausted to continue running.");
  });

  await t.test("`ms_sprint_verbose` calla lo que le toca", () => {
    // «0» calla todo; «1» deja los `UNABLE` y quita el trote — la rama nueva
    // del mod, clplayer.cpp:234-266.
    assert.equal(avisoDeCarrera({ corriendoAntes: false, corriendoAhora: true, verbose: "0" }), null);
    assert.equal(avisoDeCarrera({ corriendoAntes: false, corriendoAhora: true, verbose: "1" }), null);
    assert.equal(avisoDeCarrera({ ...corriendo, verbose: "1" }), null);
    // Pero el «no puedes» sale con «1», que es la diferencia entre 0 y 1.
    assert.equal(avisoDeCarrera({ ...corriendo, aguante: 0, verbose: "1" })?.texto,
      "You are too exhausted to continue running.");
  });
});

test("cuándo se corre: las cinco condiciones de DoSprint()", async (t) => {
  const base = { pulsaCorrer: true, adelante: 1, aguante: 10 };

  await t.test("hace falta pulsar CORRER y ADELANTE a la vez", () => {
    assert.equal(puedeCorrer(base), true);
    assert.equal(puedeCorrer({ ...base, pulsaCorrer: false }), false);
    assert.equal(puedeCorrer({ ...base, adelante: 0 }), false);
    // Correr hacia atrás no existe, y de lado tampoco.
    assert.equal(puedeCorrer({ ...base, adelante: -1 }), false);
  });

  await t.test("no se corre agachado ni atacando", () => {
    assert.equal(puedeCorrer({ ...base, agachado: true }), false);
    assert.equal(puedeCorrer({ ...base, atacando: true }), false);
  });

  await t.test("empezar pide aguante > 1; seguir, > 0", () => {
    assert.equal(puedeCorrer({ ...base, aguante: 1 }), false);
    assert.equal(puedeCorrer({ ...base, aguante: 1.5 }), true);
    // Ya corriendo, con 0,5 se sigue.
    assert.equal(puedeCorrer({ ...base, corriendoYa: true, aguante: 0.5 }), true);
    assert.equal(puedeCorrer({ ...base, corriendoYa: true, aguante: 0 }), false);
  });

  await t.test("y un frenazo de más de 50 corta la carrera", () => {
    // Chocar con algo. Es lo que impide correr contra una pared para mantener
    // la carrera mientras se recupera el aguante.
    assert.equal(puedeCorrer({ ...base, corriendoYa: true, rapidez: 100, rapidezAnterior: 180 }), false);
    assert.equal(puedeCorrer({ ...base, corriendoYa: true, rapidez: 150, rapidezAnterior: 180 }), true);
  });
});

test("el paso completo respeta el tope de velocidad del motor", () => {
  let v = [0, 0, 0];
  for (let i = 0; i < 100; i++) {
    v = pasoDeVelocidad(v, { intencion: { adelante: 1 }, maxima: 99999, dt: DT, enSuelo: true }).velocidad;
  }
  for (const c of v) assert.ok(Math.abs(c) <= MOVEVARS.velocidadMaxima, `${c}`);
});

describe("el agua y las escaleras, de `pm_shared.cpp`", () => {
  test("los tres niveles de agua salen de la CAJA, no de números elegidos", () => {
    // `PM_CheckWater` mira tres puntos: pies+1, el centro de la caja y el ojo.
    // Con la caja de Master Sword son 1, 36 y 64 sobre la planta.
    const hasta = (z) => (h) => h <= z;
    assert.equal(nivelDeAgua(hasta(0)), 0, "por debajo de los pies no moja");
    assert.equal(nivelDeAgua(hasta(2)), 1, "a los tobillos");
    assert.equal(nivelDeAgua(hasta(40)), 2, "por la cintura");
    assert.equal(nivelDeAgua(hasta(70)), 3, "por encima de los ojos");
    // El umbral del centro es exactamente la mitad del alto.
    assert.equal(nivelDeAgua(hasta(CAJA.alto / 2 - 0.01)), 1);
    assert.equal(nivelDeAgua(hasta(CAJA.alto / 2)), 2);
    // Y agachado los tres puntos bajan con la caja.
    assert.equal(nivelDeAgua(hasta(20), { agachado: true }), 2);
    assert.equal(nivelDeAgua(hasta(20)), 1, "de pie, lo mismo sólo llega a los tobillos");
  });

  test("se nada a las cuatro quintas partes de lo que se anda", () => {
    // `wishspeed *= 0.8` DESPUÉS de capar. Se deja converger y se mide el tope.
    let v = [0, 0, 0];
    for (let i = 0; i < 400; i++) {
      v = nadar(v, { intencion: { adelante: 1 }, yaw: 0, maxima: 160, dt: 1 / 60 }).velocidad;
    }
    const tope = Math.hypot(v[0], v[2]);
    assert.ok(Math.abs(tope - 160 * 0.8) < 1, `${tope.toFixed(1)} debería acercarse a 128`);
  });

  test("y sin tocar nada te HUNDES, que es lo que hace que salir valga algo", () => {
    // `wishvel[2] -= 60` cuando no hay ninguna tecla.
    let v = [0, 0, 0];
    for (let i = 0; i < 200; i++) v = nadar(v, { intencion: {}, dt: 1 / 60 }).velocidad;
    assert.ok(v[1] < -10, `debería bajar y da ${v[1].toFixed(1)}`);
    // Y el control: con una tecla, no.
    let w = [0, 0, 0];
    for (let i = 0; i < 200; i++) w = nadar(w, { intencion: { adelante: 1 }, dt: 1 / 60 }).velocidad;
    assert.ok(Math.abs(w[1]) < 1, `con tecla no debería hundirse y da ${w[1].toFixed(1)}`);
  });

  test("el agua frena la CAÍDA, y el aire no — por eso caer al agua no mata", () => {
    // Escribí este control al revés y me corrigió el código, que es lo que
    // tiene que pasar: creía que `PM_Friction` sólo tocaba la horizontal y
    // resulta que escala los tres ejes igual que `PM_WaterMove`
    // (`speed = sqrt(x²+y²+z²)` y luego `vel *= newspeed/speed`).
    //
    // La diferencia real está en CUÁNDO se aplica: en tierra, `pasoDeVelocidad`
    // sólo roza en el suelo, y ahí la vertical ya vale cero. En el aire no roza
    // nada. En el agua se roza SIEMPRE, cayendo incluido — y eso es lo que hace
    // que tirarse de una altura al agua no te mate.
    const cayendo = [0, -400, 0];
    const enAgua = nadar(cayendo, { intencion: { adelante: 1 }, dt: 1 / 60 }).velocidad;
    assert.ok(enAgua[1] > cayendo[1] + 5, `el agua debería frenar la caída: ${enAgua[1].toFixed(1)}`);
    const enAire = pasoDeVelocidad(cayendo, { enSuelo: false, dt: 1 / 60 }).velocidad;
    assert.ok(enAire[1] < cayendo[1], `en el aire sólo acelera hacia abajo: ${enAire[1].toFixed(1)}`);

    // Y cuánto frena, que es lo que decide si mata: desde la velocidad mortal
    // (1024) el agua deja la caída por debajo de la segura (580) en menos de un
    // segundo.
    let v = [0, -CAIDA.mortal, 0];
    let t = 0;
    while (-v[1] > CAIDA.seguro && t < 5) { v = nadar(v, { intencion: {}, dt: 1 / 60 }).velocidad; t += 1 / 60; }
    assert.ok(t < 1, `debería frenar en menos de un segundo y tarda ${t.toFixed(2)}`);
  });

  test("la normal de una escalera es su eje más fino, hacia el jugador", () => {
    // Las dos de Gate City miden 40×5×415 y 48×4×408 unidades: no hay
    // ambigüedad, el segundo eje más fino mide ocho veces más.
    const caja = { min: [0, 0, 0], max: [40, 415, 5] };   // fina en Z
    assert.deepEqual(normalDeEscalera(caja, [20, 100, 9]), [0, 0, 1]);
    assert.deepEqual(normalDeEscalera(caja, [20, 100, -4]), [0, 0, -1]);
  });

  test("en la escalera, sin tocar nada no te caes", () => {
    // `MOVETYPE_FLY` y `VectorClear(velocity)`: ni gravedad ni deslizamiento.
    const r = trepar([0, -300, 0], { intencion: {}, normal: [0, 0, 1] });
    assert.deepEqual(r.velocidad, [0, 0, 0]);
  });

  test("mirar a la escalera y empujar de frente te SUBE", () => {
    // Es la idea del motor y la que no se adivina: lo que va contra la pared se
    // convierte en vertical. Mirando a −Z (yaw 0) contra una escalera cuya
    // normal es +Z, andar hacia delante sube.
    const r = trepar([0, 0, 0], { intencion: { adelante: 1 }, yaw: 0, cabeceo: 0, normal: [0, 0, 1] });
    assert.ok(r.velocidad[1] > 100, `debería subir y da ${r.velocidad[1].toFixed(1)}`);
    // Y de espaldas, baja.
    const b = trepar([0, 0, 0], { intencion: { adelante: -1 }, yaw: 0, normal: [0, 0, 1] });
    assert.ok(b.velocidad[1] < -100, `debería bajar y da ${b.velocidad[1].toFixed(1)}`);
  });

  test("y mirando hacia arriba también, que es el otro modo de subir", () => {
    // Con el cabeceo a 60° mirando al cielo, empujar hacia delante sube aunque
    // no se apunte a la pared. Sin meter el cabeceo en la mirada, esto daría
    // cero y la escalera sólo funcionaría de una forma.
    const r = trepar([0, 0, 0], {
      intencion: { adelante: 1 }, yaw: Math.PI / 2, cabeceo: Math.PI / 3, normal: [0, 0, 1],
    });
    assert.ok(r.velocidad[1] > 100, `debería subir y da ${r.velocidad[1].toFixed(1)}`);
  });

  test("saltar desde la escalera empuja 270 y la suelta", () => {
    const r = trepar([0, 0, 0], { intencion: {}, normal: [1, 0, 0], saltar: true });
    assert.equal(r.soltar, true);
    assert.equal(Math.round(Math.hypot(...r.velocidad)), SALTO_DESDE_ESCALERA);
  });
});
