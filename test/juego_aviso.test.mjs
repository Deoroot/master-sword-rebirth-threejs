// LA VENTANA DE AVISO, la de arriba a la izquierda. Regla: `src/play/aviso.js`.
//
// Lo que estas pruebas tienen que poder ver es lo que estaba mal: que un
// mensaje que el mod manda por `SendHUDMsg` acabara en la consola de sucesos.
// La parte de «acabara» es de la sonda —es dónde se dibuja— y está en
// `sondas/hud.mjs`. Aquí está la regla: cuánto dura, cómo se desvanece y dónde
// cae cada una de la pila.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  AVISO, AYUDA, COLOR_TITULO, COLOR_TEXTO,
  duracionDeAyuda, conSaltos, mezcla, alfaDeLaLetra, alfaDelFondo, seVa,
  yDeLaVentana, anclaDelAviso, anclaDeLaAyuda, PilaDeAvisos,
} from "../src/play/aviso.js";
import { esquinaDeLaConsola } from "../src/play/hud.js";

describe("los números, tal como los declara el mod", () => {
  test("`vgui_infowin.h:13-27`", () => {
    assert.equal(AVISO.duracion, 8.0);
    assert.equal(AVISO.entrada, 1.0);
    assert.equal(AVISO.salida, 1.0);
    assert.equal(AVISO.fondo, 128);
    assert.equal(AVISO.x, 20);
    assert.equal(AVISO.y, 50);
    assert.equal(AVISO.espaciado, 4);
  });

  test("el título es 225 y no 255, que es lo que uno escribiría solo", () => {
    // `Title->setFgColor(225, 0, 0, 0)`, vgui_infowin.h:43. El 225 es raro y
    // por eso está comprobado: es exactamente la clase de número que alguien
    // «arregla» a 255 al pasar por al lado.
    assert.deepEqual([...COLOR_TITULO], [225, 0, 0]);
    assert.deepEqual([...COLOR_TEXTO], [192, 192, 192]);
    assert.deepEqual([...AYUDA.color], [0, 200, 20]);
  });
});

describe("la mezcla: entra en un segundo, se está seis, sale en uno", () => {
  test("los cuatro instantes que se ven", () => {
    assert.equal(mezcla(0), 0);            // nace invisible
    assert.equal(mezcla(0.5), 0.5);        // a medio entrar
    assert.equal(mezcla(1), 1);            // ya entera
    assert.equal(mezcla(4), 1);            // quieta
    assert.equal(mezcla(7.5), 0.5);        // a medio salir
    assert.equal(mezcla(8), 0);            // fuera
  });

  test("y no se sale de [0,1] ni antes de nacer ni pasada la hora", () => {
    // El `V_min` del motor es lo que lo sujeta por arriba; el `Math.max(0,…)`
    // de la entrada, por abajo. Sin uno de los dos esto da un negativo, y un
    // negativo en una opacidad de CSS no es un error: es un recuadro invisible.
    for (const t of [-5, -0.001, 0, 3, 8, 9, 100]) {
      const f = mezcla(t);
      assert.ok(f >= 0 && f <= 1, `mezcla(${t}) = ${f}`);
    }
  });

  test("el alfa es el del MOTOR: 0 es opaco y 255 invisible", () => {
    // Al revés que CSS, y por eso se devuelve el número del motor en vez de
    // traducirlo aquí: si alguien lo mete tal cual en un `opacity` se ve el
    // fallo en cuanto mira la pantalla, en vez de salir un recuadro que se
    // desvanece justo al revés y parece intencionado.
    assert.equal(alfaDeLaLetra(0), 255);
    assert.equal(alfaDeLaLetra(1), 0);
    assert.equal(alfaDeLaLetra(4), 0);
    assert.equal(alfaDeLaLetra(8), 255);
  });

  test("el fondo NUNCA llega a opaco: se queda en 128", () => {
    // `255 - ((255 - 128) * fadeamt)`. Es la diferencia entre un recuadro que
    // tapa el mundo y uno que se lee encima, y es lo único que hace falta
    // saber para dibujarlo bien.
    assert.equal(alfaDelFondo(0), 255);        // invisible al nacer
    assert.equal(alfaDelFondo(4), 128);        // medio velo, y no menos
    assert.equal(alfaDelFondo(8), 255);
    let minimo = 255;
    for (let t = 0; t <= 8; t += 0.05) minimo = Math.min(minimo, alfaDelFondo(t));
    assert.equal(minimo, 128, "el fondo se ha vuelto más opaco que `INFOWIN_BKTRANS`");
  });

  test("se va pasada la duración, y NO antes", () => {
    assert.equal(seVa(7.999), false);
    assert.equal(seVa(8), false);       // `>` estricto: los ocho justos siguen
    assert.equal(seVa(8.001), true);
  });
});

describe("la ayuda dura lo que mide su texto", () => {
  test("`INFOWIN_DURATION + strlen(Text) / 60`", () => {
    assert.equal(duracionDeAyuda(""), 8);
    assert.equal(duracionDeAyuda("x".repeat(60)), 9);
    assert.equal(duracionDeAyuda("x".repeat(120)), 10);
  });

  test("y por eso un consejo largo no dura lo mismo que un aviso", () => {
    // El control que hace que la línea de arriba signifique algo: si alguien
    // le pone `AVISO.duracion` a las ayudas, esto se pone rojo. Sin él, una
    // implementación que devolviera 8 siempre pasaría las tres de arriba
    // menos una.
    const largo = "Press E to open doors and talk to people you meet on the road.";
    assert.ok(duracionDeAyuda(largo) > AVISO.duracion,
      "una ayuda con texto tiene que durar MÁS que un aviso pelado");
  });

  test("las barras verticales son saltos de línea, y sólo en la ayuda", () => {
    assert.equal(conSaltos("uno|dos|tres"), "uno\ndos\ntres");
    const pila = new PilaDeAvisos("aviso");
    assert.equal(pila.poner("T", "uno|dos").texto, "uno|dos",
      "un AVISO no parte por `|`: eso es cosa de `AddHelpWin`");
    assert.equal(new PilaDeAvisos("ayuda").poner("T", "uno|dos").texto, "uno\ndos");
  });
});

describe("dónde cae la pila", () => {
  const altos = [30, 20, 25];

  test("la primera arriba del todo, las demás debajo con su espaciador", () => {
    assert.equal(yDeLaVentana(0, altos, 0), AVISO.y);
    assert.equal(yDeLaVentana(1, altos, 0), AVISO.y + 30 + AVISO.espaciado);
    assert.equal(yDeLaVentana(2, altos, 0), AVISO.y + 30 + 4 + 20 + 4);
  });

  test("y suben ANTES de que la primera acabe de irse", () => {
    // El arreglo del motor: si la de arriba se está desvaneciendo, las de
    // abajo van subiendo a la vez, para que no haya un salto seco cuando
    // desaparezca.
    const quieta = yDeLaVentana(1, altos, 0);
    const aMedias = yDeLaVentana(1, altos, 7.5);
    const alFinal = yDeLaVentana(1, altos, 8.0);
    assert.ok(aMedias < quieta, "no se ha movido mientras la primera se iba");
    assert.equal(alFinal, AVISO.y, "al irse la primera, la segunda ocupa su sitio");
    assert.equal(aMedias, quieta - (30 + AVISO.espaciado) * 0.5);
  });

  test("la de arriba NO se mueve por sí misma", () => {
    // `if (idx > 0)`. Si esto se cayera, la primera ventana se iría
    // deslizando hacia arriba mientras se desvanece y saldría de la pantalla.
    assert.equal(yDeLaVentana(0, altos, 7.5), AVISO.y);
  });

  test("LA ERRATA 1, portada: se mira MI duración, no la de la primera", () => {
    // Con avisos no se nota —duran ocho todos—, así que el caso que lo enseña
    // tiene que ser una ayuda: una larga debajo de una corta. Si algún día se
    // «arregla», esta prueba avisa de que se ha dejado de portar el fallo.
    const corta = 8.4;     // la de arriba, 24 caracteres
    const larga = 11.0;    // la de abajo, 180
    const y = yDeLaVentana(1, altos, corta - 0.5, { duracion: larga });
    assert.equal(y, AVISO.y + 30 + AVISO.espaciado,
      "con la duración de la LARGA, a los 7.9 s todavía no toca moverse");
    // Y el contraste, que es lo que lo convierte en una medida: con la
    // duración de la corta —el arreglo— sí se habría movido ya.
    assert.ok(yDeLaVentana(1, altos, corta - 0.5, { duracion: corta }) < y);
  });

  test("LA ERRATA 2, portada: sólo se mira la primera", () => {
    // Tres ventanas, y la que se está yendo es la SEGUNDA. La tercera no se
    // entera: en el motor el bloque de arriba sólo lee `Windows[0]`.
    const pila = new PilaDeAvisos("aviso");
    pila.poner("a", "1", { alto: 30 });
    pila.poner("b", "2", { alto: 20 });
    pila.poner("c", "3", { alto: 25 });
    pila.ventanas[1].t = 7.5;    // la de en medio, a medio irse
    pila.paso(0);
    assert.equal(pila.ventanas[2].y, AVISO.y + 30 + 4 + 20 + 4,
      "la tercera se ha movido, y el motor no la mueve");
  });
});

describe("las dos esquinas, que es el fallo que esto arregla", () => {
  const A = 1280, L = 720;

  test("el aviso arriba a la IZQUIERDA", () => {
    const { x, y } = anclaDelAviso(A, L);
    assert.ok(x < A / 2 && y < L / 2, `el aviso ha caído en (${x}, ${y})`);
  });

  test("la ayuda arriba a la DERECHA, y pegada al borde", () => {
    // Su x depende del ancho del recuadro porque el mod la coloca DESPUÉS de
    // medirla. Con un recuadro de 200 la esquina izquierda cae a 640-200-60.
    const { x, y } = anclaDeLaAyuda(A, L, 400);
    assert.ok(x > A / 2 && y < L / 2, `la ayuda ha caído en (${x}, ${y})`);
    // Y una ayuda más ancha empieza más a la izquierda, no más a la derecha.
    assert.ok(anclaDeLaAyuda(A, L, 600).x < x);
  });

  test("y NINGUNA de las dos cae donde la consola de sucesos", () => {
    // ESTA es la prueba del experimento 60. Los tres sitios están separados a
    // propósito desde 2008 —el comentario del mod en `AddHelpWin` dice
    // literalmente «not to overlap eventhud»— y este puerto los tenía en uno.
    const consola = esquinaDeLaConsola(A, L);
    // El positivo: si `esquinaDeLaConsola` devolviera ceros, todo lo de abajo
    // pasaría por comparar contra el origen y no mediría nada.
    assert.ok(consola.x > A / 2 && consola.y > L / 2 && consola.w > 0,
      `la consola dice estar en (${consola.x}, ${consola.y}) y no es la esquina de abajo a la derecha`);
    const aviso = anclaDelAviso(A, L);
    const ayuda = anclaDeLaAyuda(A, L, 400);
    // La consola crece hacia arriba desde su borde de abajo, así que basta con
    // que las dos ventanas estén por encima de donde empieza.
    assert.ok(aviso.y < consola.y, `aviso en y=${aviso.y}, consola en y=${consola.y}`);
    assert.ok(ayuda.y < consola.y, `ayuda en y=${ayuda.y}, consola en y=${consola.y}`);
    assert.ok(aviso.x < consola.x, "el aviso no está a la izquierda de la consola");
  });
});

describe("la pila entera, un tic detrás de otro", () => {
  test("nace, se está ocho segundos y se va sola", () => {
    const pila = new PilaDeAvisos("aviso");
    pila.poner("Gate City", "A city of dwarves.", { alto: 30 });
    assert.equal(pila.ventanas.length, 1);
    for (let i = 0; i < 70; i++) pila.paso(0.1);   // 7.0 s
    assert.equal(pila.ventanas.length, 1, "se ha ido antes de tiempo");
    assert.equal(pila.ventanas[0].alfa, 0, "a los 7 s tiene que estar entera");
    for (let i = 0; i < 15; i++) pila.paso(0.1);   // 8.5 s
    assert.equal(pila.ventanas.length, 0, "no se ha ido");
  });

  test("y en su último tic se dibuja transparente, no desaparecida", () => {
    // El orden del motor: recolocar, y LUEGO mirar si caduca. Si se mirara
    // primero, la ventana se esfumaría de golpe en vez de apagarse.
    const pila = new PilaDeAvisos("aviso");
    const v = pila.poner("T", "t", { alto: 10 });
    pila.paso(7.95);
    assert.equal(pila.ventanas.length, 1);
    assert.ok(v.mezcla < 0.06 && v.mezcla > 0, `mezcla = ${v.mezcla}`);
    assert.equal(v.alfa, 242);
  });

  test("`paso` devuelve las que hay que quitar del DOM", () => {
    // Sin esto los recuadros se quedarían en la página para siempre, invisibles
    // y tapando los clics. Que lo devuelva y no lo suponga quien dibuja.
    const pila = new PilaDeAvisos("aviso");
    pila.poner("a", "1", { alto: 10 });
    pila.poner("b", "2", { alto: 10 });
    assert.deepEqual(pila.paso(1).map((v) => v.titulo), []);
    const idas = pila.paso(8);
    assert.deepEqual(idas.map((v) => v.titulo), ["a", "b"]);
    assert.equal(pila.ventanas.length, 0);
  });

  test("y las dos pilas son independientes: un aviso no es un consejo", () => {
    const avisos = new PilaDeAvisos("aviso");
    const ayudas = new PilaDeAvisos("ayuda");
    avisos.poner("WARNING", "too difficult", { alto: 20 });
    ayudas.poner("Tip", "x".repeat(120), { alto: 20 });
    avisos.paso(9);
    assert.equal(avisos.ventanas.length, 0, "el aviso dura ocho");
    ayudas.paso(9);
    assert.equal(ayudas.ventanas.length, 1, "el consejo largo dura diez");
    assert.deepEqual(ayudas.ventanas[0].color, [0, 200, 20]);
  });
});
