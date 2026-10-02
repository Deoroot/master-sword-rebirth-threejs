// EL HUD, la regla. Sin navegador: `src/play/hud.js` no toca el DOM.
//
// Lo que se comprueba aquí es lo que decide qué se ve —el cuadro de la barra, la
// velocidad a la que persigue, el color de la cifra, y el buffer circular de la
// consola de sucesos con su decaimiento— y todo con la cita del motor al lado.
//
// Lo que NO se comprueba aquí es que se DIBUJE. Eso lo mide `npm run sonda:hud`
// en un navegador de verdad, porque es donde se rompe: un `background-position`
// mal calculado deja las cuatro barras a cero y esta batería seguiría verde.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CVARS, MAX_LINEAS, COLORES_DE_SUCESO, colorDeSuceso,
  XRES, YRES, LIENZO, LIENZO_NUESTRO, disposicionDelHud, cargaEn,
  velocidadDeRelleno, seguir, cuadroDeBarra, colorDeCifra, seVeElHud,
  cargaVisible, cargaDelTiro, ConsolaDeSucesos, COMO_EL_MOTOR, AJUSTES,
} from "../src/play/hud.js";

/** Una regla falsa: cada carácter mide 10. Así el corte es contable a mano. */
const REGLA = (t) => t.length * 10;

describe("lo que el motor deja escrito", () => {
  test("los seis colores de suceso son los seis del motor", () => {
    assert.deepEqual(COLORES_DE_SUCESO.normal.rgb, [220, 220, 220]);
    assert.deepEqual(COLORES_DE_SUCESO.nopuedes.rgb, [160, 160, 160]);
    assert.deepEqual(COLORES_DE_SUCESO.atacado.rgb, [240, 0, 0]);
    assert.deepEqual(COLORES_DE_SUCESO.bueno.rgb, [0, 240, 0]);
    assert.deepEqual(COLORES_DE_SUCESO.azul.rgb, [0, 0, 240]);
  });

  test("el color del ataque es 255×0,7 y 170×0,7, o sea 178 y 119", () => {
    // Está escrito `COLOR(255 * 0.7, 170 * 0.7, 0, 0)` y se trunca a entero. No
    // es el naranja de 255,170,0: es un ámbar mucho más apagado, y quien lo
    // copie «a ojo» de una captura se lo pone más vivo de lo que es.
    assert.deepEqual(COLORES_DE_SUCESO.ataque.rgb, [178, 119, 0]);
    assert.equal(colorDeSuceso("ataque"), "rgb(178, 119, 0)");
  });

  test("un tipo que no existe cae en el normal y no revienta", () => {
    assert.equal(colorDeSuceso("inventado"), "rgb(220, 220, 220)");
  });

  test("los cvars son los de fábrica: cinco líneas visibles y diez de memoria", () => {
    assert.equal(CVARS.ms_evthud_size, 5);
    assert.equal(CVARS.ms_evthud_history, 10);
    assert.equal(CVARS.ms_evthud_decaytime, 5);
    // Y el HUD retro viene apagado, que es por lo que el primario es el que hay
    // que portar aunque las capturas viejas enseñen frascos.
    assert.equal(CVARS.cl_retrohud, 0);
  });

  test("los ajustes arrancan siendo los del motor", () => {
    assert.deepEqual(AJUSTES, COMO_EL_MOTOR);
    assert.equal(COMO_EL_MOTOR.escalaDelMotor, true);
    assert.equal(COMO_EL_MOTOR.cargaSoloConCarga, true);
  });
});

describe("dónde cae cada cosa en la pantalla", () => {
  test("XRES y YRES escalan desde 640×480", () => {
    assert.equal(XRES(640, 1280), 1280);
    assert.equal(YRES(480, 960), 960);
    assert.equal(XRES(10, 640), 10);
  });

  test("la escala de las barras NO es alto/480: es la resta contra 730", () => {
    // 1 - ((730 - 1920*0.40) / 1080) = 1 - (730-768)/1080 = 1,0352
    const l = LIENZO(1920, 1080);
    assert.ok(Math.abs(l.escala - 1.03518) < 1e-4, `escala ${l.escala}`);
    assert.ok(Math.abs(l.anchoBarra - 331.26) < 0.01);
  });

  test("y por eso a 640×480 las barras del motor miden CUATRO píxeles", () => {
    // Es la rareza gorda de este HUD y no es cosa nuestra: a la resolución
    // nativa de la pantalla de referencia de VGUI, su propio HUD desaparece.
    const l = LIENZO(640, 480);
    assert.ok(l.anchoBarra < 5, `${l.anchoBarra} px`);
    assert.ok(l.altoBarra < 1);
  });

  test("la escala nuestra sí es alto/480, con tope", () => {
    assert.equal(LIENZO_NUESTRO(1920, 480).escala, 1);
    assert.equal(LIENZO_NUESTRO(1920, 4000).escala, 1.6);
  });

  test("la pareja de la izquierda es VIDA y PESO, no vida y maná", () => {
    // Es lo que más sorprende del reparto y lo que más fácil se copia mal:
    // `m_Bar[0]` (vida) y `m_Bar[2]` (peso) comparten la x, y `m_Bar[1]`
    // (maná) y `m_Bar[3]` (aguante) comparten la otra.
    const d = disposicionDelHud(1920, 1080);
    assert.equal(d.barras.vida.x, d.barras.peso.x);
    assert.equal(d.barras.mana.x, d.barras.aguante.x);
    assert.ok(d.barras.mana.x > d.barras.vida.x);
    assert.equal(d.barras.peso.y, d.barras.vida.y + d.altoBarra);
  });

  test("la x de las barras es un 10 pelado y NO escala", () => {
    // `coords[0] = 10;` — la única medida del panel que no pasa por XRES.
    assert.equal(disposicionDelHud(1024, 768).barras.vida.x, 10);
    assert.equal(disposicionDelHud(3840, 2160).barras.vida.x, 10);
  });

  test("el emblema se mete en la juntura y las de la derecha lo solapan un píxel", () => {
    const d = disposicionDelHud(1920, 1080);
    assert.ok(Math.abs(d.emblemaEn.x - (d.barras.vida.x + d.anchoBarra)) < 1e-9);
    assert.ok(Math.abs(d.barras.mana.x - (d.emblemaEn.x + d.emblema - 1)) < 1e-9);
  });

  test("las dos barras de carga se separan 30 px por una errata de precedencia", () => {
    // `CHARGE_SPACER_W + (i == 0) ? CHARGE_W : 0` se lee
    // `(CHARGE_SPACER_W + (i==0)) ? CHARGE_W : 0`, así que el espaciador nunca
    // se suma y las dos barras salen a ±CHARGE_W del ancla en vez de pegadas.
    const [izq, der] = cargaEn(1280, 960);
    const w = XRES(30, 1280);
    assert.equal(der.x - izq.x, 2 * w);
    // Y el ancla es 304, no 320: tampoco están centradas.
    assert.equal(izq.x, XRES(304, 1280) - w);
  });

  /**
   * CADA BARRA DEL LADO DE SU MANO, que es lo que se veía roto jugando: el
   * jugador cargaba con la derecha y se le encendía la barra de la izquierda.
   *
   *     enum hand_e { LEFT_HAND, RIGHT_HAND, ... };        genericitem.h:15-23
   *     int Bar = Item->m_Hand < 2 ? Item->m_Hand : 1;     vgui_health.h:234
   *
   * El índice 0 es `LEFT_HAND`, y el multiplicador `(i == 0) ? -1 : 1` lo pone
   * a la izquierda del ancla. Esta prueba mira el nombre Y la posición a la
   * vez, porque el fallo era justamente que la geometría estaba bien y sólo la
   * etiqueta estaba cambiada: la que sólo miraba la `x` pasaba en verde.
   */
  test("la barra de la mano derecha cae a la DERECHA del ancla", () => {
    const barras = cargaEn(1280, 960);
    const ancla = XRES(304, 1280);
    const der = barras.find((b) => b.mano === "derecha");
    const izq = barras.find((b) => b.mano === "izquierda");
    assert.ok(der && izq, "tienen que estar las dos manos, y una sola vez cada una");
    assert.equal(barras.length, 2);
    assert.ok(der.x > ancla, `la derecha en ${der.x} tendría que pasar del ancla ${ancla}`);
    assert.ok(izq.x < ancla, `la izquierda en ${izq.x} tendría que quedarse antes del ancla`);
    // Y el positivo de la posición, para que esto no pase con dos barras
    // pegadas en el sitio equivocado: siguen a ±CHARGE_W exactos.
    assert.equal(der.x - ancla, XRES(30, 1280));
    assert.equal(ancla - izq.x, XRES(30, 1280));
  });
});

describe("cómo se llena una barra", () => {
  test("el cuadro es la fracción por el último, y nunca el 0 si queda algo", () => {
    assert.equal(cuadroDeBarra(0, 25, 43), 0);
    assert.equal(cuadroDeBarra(25, 25, 43), 42);
    // Con 500 de vida máxima, un punto daría 0,084 de cuadro y el vaso se vería
    // VACÍO estando vivo. El suelo de 1 es lo que hace que «vacío» signifique
    // «muerto» y nada más.
    assert.equal(cuadroDeBarra(1, 500, 43), 1);
  });

  test("y no se pasa del último ni baja de cero", () => {
    assert.equal(cuadroDeBarra(9999, 25, 43), 42);
    assert.equal(cuadroDeBarra(-5, 25, 43), 0);
  });

  test("con el máximo a cero no sale NaN", () => {
    // El motor divide sin mirar y pinta basura; aquí se corta, porque un
    // personaje a medio cargar tiene el máximo a cero durante un fotograma.
    assert.equal(cuadroDeBarra(10, 0, 43), 0);
  });

  test("la velocidad de relleno de un novato es 24 puntos por segundo", () => {
    // `15 * (25/100)` = 3,75 → el suelo lo sube a 40 → el techo lo baja a
    // `MaxAmt - 1` = 24. Las tres líneas hacen falta para llegar al número.
    assert.equal(velocidadDeRelleno(0, 25, 25), 24);
  });

  test("y la de uno con 300 de vida es 45, que ya la manda la fórmula", () => {
    // Con el vaso casi lleno, para que no salte la cláusula de los 200.
    assert.equal(velocidadDeRelleno(290, 300, 300), 45);
  });

  test("un salto de más de 200 puntos va a mil por segundo", () => {
    // Es lo que evita que al entrar en el mapa la barra suba despacito desde
    // cero durante diez segundos.
    assert.equal(velocidadDeRelleno(0, 250, 250), 1000);
  });

  test("perseguir no se pasa nunca del objetivo", () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = seguir(v, 25, 25, 1 / 60);
    assert.equal(v, 25);
  });

  test("y tarda aproximadamente un segundo en llenar un vaso de novato", () => {
    let v = 0, t = 0;
    while (v < 25 && t < 5) { v = seguir(v, 25, 25, 1 / 60); t += 1 / 60; }
    assert.ok(t > 0.9 && t < 1.2, `${t.toFixed(2)} s`);
  });

  test("por encima de 3000 el vaso da un tirón cada fotograma", () => {
    // `if (m_CurrentAmt > 3000) m_CurrentAmt = 3000.0;` va ANTES del paso, y no
    // es un tope: es un tirón hacia abajo que el paso siguiente deshace. Un
    // personaje con 5000 de vida vería el vaso rebotando entre 3000 y 4000 para
    // siempre. Nadie llega hoy a esa cifra, pero está y se porta.
    assert.equal(seguir(5000, 5000, 5000, 0), 3000);     // el tirón, sin mover
    assert.equal(seguir(5000, 5000, 5000, 1), 4000);     // y la vuelta
  });

  test("la cifra se pone roja por debajo de un cuarto, menos en el peso", () => {
    assert.equal(colorDeCifra("vida", 26, 100), "rgb(255, 255, 255)");
    assert.equal(colorDeCifra("vida", 24, 100), "rgb(250, 0, 0)");
    assert.equal(colorDeCifra("aguante", 1, 100), "rgb(250, 0, 0)");
    // `if (m_Type != 2)`: en el peso, poco es BUENO. Pintarlo rojo diría lo
    // contrario de lo que pasa.
    assert.equal(colorDeCifra("peso", 0, 100), "rgb(255, 255, 255)");
  });
});

describe("cuándo se ve el HUD y cuándo la barra de carga", () => {
  test("con un panel delante el HUD se esconde", () => {
    assert.equal(seVeElHud({ panelAbierto: true }), false);
    assert.equal(seVeElHud({}), true);
  });

  test("muerto tampoco se ve, y sin personaje cargado tampoco", () => {
    assert.equal(seVeElHud({ vivo: false }), false);
    assert.equal(seVeElHud({ cargado: false }), false);
  });

  test("UN ARCO NO ENSEÑA NUNCA LA BARRA DE CARGA, y no es cosa nuestra", () => {
    // `Attack_IsCharging()` empieza por `if (GetHighestAttackCharge() == 0)
    // return false;` — antes de mirar si el ataque es de tiro. Un arco no
    // declara `reg.attack.charge`, así que su carga máxima es cero y la guarda
    // le cierra la puerta a la rama que sí sabe medir el tensado.
    assert.equal(cargaVisible({ cargaMaxima: 0, tensando: true, carga: 0.8 }), false);
    // Con el interruptor apagado, el tensado se ve.
    assert.equal(
      cargaVisible({ cargaMaxima: 0, tensando: true, carga: 0.8, ajustes: { cargaSoloConCarga: false } }),
      true
    );
  });

  test("y un arma con ataque cargado sí la enseña, pero no a cero", () => {
    assert.equal(cargaVisible({ cargaMaxima: 2, tensando: true, carga: 0.3 }), true);
    assert.equal(cargaVisible({ cargaMaxima: 2, tensando: true, carga: 0 }), false);
  });

  test("la carga de un tiro empieza a contar en el mínimo, no en cero", () => {
    // Con `RANGED_HOLD_MINMAX 1.1;1.3` la barra está a cero durante 1,1 s y
    // recorre el 0-100 % en los 0,2 s siguientes. Es el mismo 15 % de fuerza
    // que se midió en el experimento 23, visto desde el otro lado.
    assert.equal(cargaDelTiro(0.5, [1.1, 1.3]), 0);
    assert.ok(Math.abs(cargaDelTiro(1.2, [1.1, 1.3]) - 0.5) < 0.002);
    assert.equal(cargaDelTiro(2.0, [1.1, 1.3]), 1);
  });
});

describe("la consola de sucesos", () => {
  const nueva = (o = {}) => new ConsolaDeSucesos({ medir: REGLA, ancho: 0, ...o });
  /** Corre el reloj a fotogramas de una décima y apunta cuándo cae cada línea. */
  const correr = (c, segundos) => {
    const caidas = [];
    let t = 0, antes = c.visibles;
    for (; t < segundos; t += 0.1) {
      c.paso(0.1);
      if (c.visibles < antes) { caidas.push(Number(t.toFixed(1))); antes = c.visibles; }
    }
    return caidas;
  };

  test("crece una línea por suceso hasta el tope y no más", () => {
    const c = nueva();
    for (let i = 0; i < 9; i++) c.imprimir("normal", `linea ${i}`);
    assert.equal(c.visibles, 5);
    assert.equal(c.total, 9);
  });

  test("el historial es un anillo: la décima línea tira la primera", () => {
    const c = nueva();
    for (let i = 0; i < 13; i++) c.imprimir("normal", `l${i}`);
    assert.equal(c.total, 10);
    assert.deepEqual(c.vistas.map((l) => l.texto), ["l8", "l9", "l10", "l11", "l12"]);
  });

  test("y el tope duro son 128 líneas aunque el cvar pida más", () => {
    assert.equal(nueva({ historial: 500 }).maxLineas, MAX_LINEAS);
  });

  test("se encoge UNA línea por decaimiento, no todas de golpe", () => {
    const c = nueva({ decaimiento: 5 });
    for (let i = 0; i < 5; i++) c.imprimir("normal", `l${i}`);
    assert.equal(c.visibles, 5);
    const caidas = correr(c, 12);
    // Cinco segundos hasta la primera y otros cinco hasta la segunda.
    assert.equal(caidas.length, 2, `caídas en ${caidas.join(", ")}`);
    assert.ok(Math.abs(caidas[1] - caidas[0] - 5) < 0.25, caidas.join(", "));
    assert.equal(c.visibles, 3);
  });

  test("cinco líneas tardan veinticinco segundos en irse", () => {
    const c = nueva({ decaimiento: 5 });
    for (let i = 0; i < 5; i++) c.imprimir("normal", `l${i}`);
    let t = 0;
    while (c.visibles > 0 && t < 60) { c.paso(0.1); t += 0.1; }
    assert.ok(t > 24 && t < 27, `${t.toFixed(1)} s`);
  });

  test("un suceso nuevo rearma el reloj y resucita la pila", () => {
    const c = nueva({ decaimiento: 5 });
    c.imprimir("normal", "uno");
    correr(c, 6);
    assert.equal(c.visibles, 0);
    c.imprimir("ataque", "dos");
    assert.equal(c.visibles, 1);
    assert.equal(c.vistas[0].tipo, "ataque");
  });

  test("una línea larga se parte por el último espacio que cabe", () => {
    // Regla de 10 por carácter y 100 de ancho: caben diez caracteres.
    const c = nueva({ ancho: 100 });
    c.imprimir("normal", "abc def ghijklmno");
    assert.deepEqual(c.vistas.map((l) => l.texto), ["abc def", "ghijklmno"]);
    assert.equal(c.vistas[1].vieneDeArriba, true);
  });

  test("y si no hay ningún espacio, se corta a lo bruto", () => {
    const c = nueva({ ancho: 50 });
    c.imprimir("normal", "abcdefghij");
    assert.deepEqual(c.vistas.map((l) => l.texto), ["abcde", "fghij"]);
  });

  test("las dos mitades de una línea partida se van EN EL MISMO TIC", () => {
    // Es el detalle que hace que la consola no deje medias frases colgando:
    // al encoger, si la línea de arriba es una continuación, el reloj no se
    // rearma (`if (!topLine->m_SpansFromPrevLine) m_ShrinkTime = 0;`).
    const partida = nueva({ ancho: 100, decaimiento: 5 });
    partida.imprimir("normal", "abc def ghijklmno");
    assert.equal(partida.visibles, 2);
    const unaLarga = correr(partida, 12);
    assert.equal(partida.visibles, 0);
    // Las dos caídas seguidas, a un fotograma de distancia.
    assert.equal(unaLarga.length, 2, unaLarga.join(", "));
    assert.ok(unaLarga[1] - unaLarga[0] < 0.25, `${unaLarga.join(" y ")} s`);

    // Y el contraste: dos líneas SUELTAS tardan cinco segundos entre una y otra.
    const sueltas = nueva({ ancho: 100, decaimiento: 5 });
    sueltas.imprimir("normal", "abc def");
    sueltas.imprimir("normal", "ghijklmno");
    const dosCortas = correr(sueltas, 12);
    assert.ok(dosCortas[1] - dosCortas[0] > 4.5, `${dosCortas.join(" y ")} s`);
  });

  test("un salto de línea rompe antes que cualquier espacio", () => {
    const c = nueva({ ancho: 10000 });
    c.imprimir("normal", "uno\ndos");
    assert.deepEqual(c.vistas.map((l) => l.texto), ["uno", "dos"]);
  });

  test("un texto vacío no imprime nada", () => {
    const c = nueva();
    c.imprimir("normal", "");
    assert.equal(c.total, 0);
    assert.equal(c.visibles, 0);
  });

  test("AvPág baja por el historial sin pasarse del final", () => {
    const c = nueva();
    for (let i = 0; i < 9; i++) c.imprimir("normal", `l${i}`);
    c.desplazar(false); c.desplazar(false);
    assert.deepEqual(c.vistas.map((l) => l.texto), ["l2", "l3", "l4", "l5", "l6"]);
    for (let i = 0; i < 9; i++) c.desplazar(true);
    assert.deepEqual(c.vistas.map((l) => l.texto), ["l4", "l5", "l6", "l7", "l8"]);
  });

  test("y desplazar hacia arriba no sube más allá de la primera pantalla", () => {
    const c = nueva();
    for (let i = 0; i < 9; i++) c.imprimir("normal", `l${i}`);
    for (let i = 0; i < 20; i++) c.desplazar(false);
    assert.deepEqual(c.vistas.map((l) => l.texto), ["l0", "l1", "l2", "l3", "l4"]);
  });

  test("con el jugador leyendo el historial, un suceso nuevo NO le mueve la vista", () => {
    // `if (m_ActiveLine >= (iNewLine - 1)) m_ActiveLine = iNewLine;` — sólo
    // salta al fondo quien ya estaba en el fondo.
    const c = nueva();
    for (let i = 0; i < 9; i++) c.imprimir("normal", `l${i}`);
    for (let i = 0; i < 5; i++) c.desplazar(false);
    const antes = c.vistas.map((l) => l.texto);
    c.imprimir("atacado", "¡te pegan!");
    assert.deepEqual(c.vistas.map((l) => l.texto), antes);
  });

  test("el fondo de fábrica es medio transparente y con un punto de azul", () => {
    assert.equal(nueva().fondo, `rgba(0, 0, 20, ${128 / 255})`);
  });
});
