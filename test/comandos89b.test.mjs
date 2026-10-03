// LOS PEQUEÑOS DEL INTÉRPRETE — el 89b.
//
// `svplaysound`, `svplayrandomsound`, `sound.play3d`/`svsound.play3d`,
// `vectoradd`, `vectormultiply`, `vectorset`, `strconc` y los cuatro `token.*`.
// Son los comandos «puros» que más le faltaban al guion del jugador
// (`npm run jugador`), y cada uno lleva su cita en `src/play/guion.js`.
//
// Todas las pruebas le dan TEXTO al analizador (CLAUDE.md §4, la variante del
// 67) y los números que SON la regla van escritos a mano (la del 75): un
// «(1.00,2.00,3.00)» es lo que imprime `"(%.2f,%.2f,%.2f)"`
// (sharedutil.cpp:111), no algo que se calcule aquí con la misma función que
// se prueba.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { Guion, partirGuion, COMANDOS, vectorDeTexto, textoDeVector } from "../src/play/guion.js";
import { entornoDe } from "../src/play/npcguion.js";

/** Corre un cuerpo de evento y deja mirar variables y sonidos. */
function corre(cuerpo, extra = {}) {
  const visto = { sonidos: [], en3d: [] };
  const entorno = {
    ...entornoDe({}),
    sonar: (a, o) => visto.sonidos.push({ a, ...o }),
    sonarEn: (a, o) => visto.en3d.push({ a, ...o }),
    azar: () => 0,
    ...extra,
  };
  const g = new Guion({ eventos: partirGuion(`{ e\n${cuerpo}\n}`).eventos, entorno });
  g.llamar("e", []);
  return { guion: g, ...visto, v: (n) => g.vars.get(n), noSoportados: g.noSoportados };
}

describe("el 89b: están en la lista y ninguno cae al `default`", () => {
  for (const n of ["svplaysound", "svplayrandomsound", "sound.play3d", "svsound.play3d",
    "vectoradd", "vectormultiply", "vectorset", "strconc",
    "token.add", "token.del", "token.set", "token.scramble"]) {
    test(n, () => {
      assert.ok(COMANDOS.has(n));
      const { noSoportados } = corre(`setvard V (1,2,3)\n${n} V x 1`);
      assert.deepEqual(noSoportados.filter((x) => x.nombre === n), []);
    });
  }
});

describe("StringToVec / VecToString (sharedutil.cpp:106-124)", () => {
  test("tres números, dos números, y lo que no es un vector vale cero", () => {
    assert.deepEqual(vectorDeTexto("(1,2,3)"), [1, 2, 3]);
    assert.deepEqual(vectorDeTexto("(1,2)"), [1, 2, 0]);
    assert.deepEqual(vectorDeTexto("L_NO_EXISTE"), [0, 0, 0]);
    assert.deepEqual(vectorDeTexto("(5)"), [0, 0, 0]);
  });
  test("el `(` va el primero; `%f` salta blancos y la `,` no; el `)` no se mira", () => {
    assert.deepEqual(vectorDeTexto(" (1,2,3)"), [0, 0, 0]);
    assert.deepEqual(vectorDeTexto("( 1, 2, 3)"), [1, 2, 3]);
    assert.deepEqual(vectorDeTexto("(1 ,2,3)"), [0, 0, 0]);
    assert.deepEqual(vectorDeTexto("(1,2,3"), [1, 2, 3]);
  });
  test("dos decimales siempre, y el signo del cero negativo", () => {
    assert.equal(textoDeVector([1, 2, 3]), "(1.00,2.00,3.00)");
    assert.equal(textoDeVector([-0, 0.5, -1.25]), "(-0.00,0.50,-1.25)");
  });
});

describe("vectoradd (scriptcmds.cpp:7073-7092)", () => {
  test("dos vectores", () => {
    const { v } = corre("setvard V (1,2,3)\nvectoradd V (10,20,30)");
    assert.equal(v("V"), "(11.00,22.00,33.00)");
  });
  test("una componente: la forma de 231 de las 891 líneas", () => {
    const { v } = corre("setvard V (1,2,3)\nvectoradd V z 64");
    assert.equal(v("V"), "(1.00,2.00,67.00)");
  });
  test("con tres vectores IGNORA el valor del primero", () => {
    const { v } = corre("setvard V (100,100,100)\nvectoradd V (1,0,0) (0,2,0)");
    assert.equal(v("V"), "(1.00,2.00,0.00)");
  });
  // Lo escribí esperando (1,2,3) —«suma un vector cero al de antes»— y salió
  // rojo con el código bien: con TRES parámetros y sin componente es la forma
  // de tres vectores, que suma «X» y «64» leídos como vectores e ignora V.
  test("`X` mayúscula no es componente (`strcmp`): cae a la forma de tres vectores", () => {
    const { v } = corre("setvard V (1,2,3)\nvectoradd V X 64");
    assert.equal(v("V"), "(0.00,0.00,0.00)");
  });
  test("sobre una variable sin poner parte de cero, y escribe en la LOCAL si la hay", () => {
    const { v } = corre("local L (0,0,0)\nvectoradd L y 5\nsetvard COPIA L\nvectoradd NUEVO (1,1,1)");
    assert.equal(v("COPIA"), "(0.00,5.00,0.00)");
    assert.equal(v("NUEVO"), "(1.00,1.00,1.00)");
    assert.equal(v("L"), undefined);
  });
});

describe("vectormultiply (scriptcmds.cpp:7098-7125)", () => {
  test("por un número", () => {
    const { v } = corre("setvard V (1,2,3)\nvectormultiply V 0.5");
    assert.equal(v("V"), "(0.50,1.00,1.50)");
  });
  test("por un vector, componente a componente", () => {
    const { v } = corre("setvard V (1,2,3)\nvectormultiply V (2,3,4)");
    assert.equal(v("V"), "(2.00,6.00,12.00)");
  });
  test("un factor NEGATIVO no empieza por dígito: se lee como vector y da cero", () => {
    const { v } = corre("setvard V (1,2,3)\nvectormultiply V -2");
    assert.equal(v("V"), "(0.00,0.00,0.00)");
  });
  test("con componente las otras dos se van a cero (`VecMultiply` por (f,0,0))", () => {
    const { v } = corre("setvard V (1,2,3)\nvectormultiply V x 2");
    assert.equal(v("V"), "(2.00,0.00,0.00)");
  });
  test("con tres: el 2.º por el 3.º, y mira `isdigit` del 2.º", () => {
    const { v } = corre("setvard D (1,2,3)\nvectormultiply V D (2,2,0)");
    assert.equal(v("V"), "(2.00,4.00,0.00)");
  });
});

describe("vectorset (scriptcmds.cpp:7130-7144)", () => {
  test("pone una componente", () => {
    const { v } = corre("setvard V (1,2,3)\nvectorset V z -7.5");
    assert.equal(v("V"), "(1.00,2.00,-7.50)");
  });
  test("una componente que no existe REFORMATEA igual la variable", () => {
    const { v, noSoportados } = corre("setvard V (1,2,3)\nvectorset V w 9");
    assert.equal(v("V"), "(1.00,2.00,3.00)");
    assert.deepEqual(noSoportados, []);
  });
});

describe("strconc (scriptcmds.cpp:6813-6833)", () => {
  test("lo que tenía, PEGADO al primero, y los demás con espacio — el del jugador", () => {
    // player/player_main.script:933-934, con 2000 en lugar de $int(CVAR_HP_LIMIT)
    const { v } = corre('local MSG_TITLE "HP LIMIT is "\nstrconc MSG_TITLE 2000 hp\nsetvard OUT MSG_TITLE');
    assert.equal(v("OUT"), "HP LIMIT is 2000 hp");
  });
  test("las comillas son un parámetro: «\" \"» suma un espacio más", () => {
    const { v } = corre('setvard D Bob\nstrconc D " " has started');
    assert.equal(v("D"), "Bob  has started");
  });
  test("sobre una variable SIN PONER pega su nombre delante (no lo comprueba, a diferencia de `stradd`)", () => {
    const { v } = corre("strconc NADA hola mundo");
    assert.equal(v("NADA"), "NADAhola mundo");
  });
});

describe("token.add / token.del / token.set / token.scramble (scriptcmds.cpp:6865-6987)", () => {
  test("token.add: `;` sólo si no estaba vacía", () => {
    const { v } = corre("setvard L ''\ntoken.add L a\ntoken.add L b");
    assert.equal(v("L"), "a;b");
  });
  test("token.add sobre una variable sin poner empieza por su nombre", () => {
    const { v } = corre("token.add L a");
    assert.equal(v("L"), "L;a");
  });
  test("token.del borra por índice, y fuera de rango no escribe", () => {
    const { v } = corre("setvard L a;b;c\ntoken.del L 1\nsetvard M a;b\ntoken.del M 5\nsetvard N x\ntoken.del N -1");
    assert.equal(v("L"), "a;c");
    assert.equal(v("M"), "a;b");
    assert.equal(v("N"), "x");
  });
  test("token.del corta en el primer hueco (`TokenizeString`)", () => {
    const { v } = corre("setvard L a;;b;c\ntoken.del L 0");
    assert.equal(v("L"), "");
  });
  test("token.set cambia uno; fuera de rango no escribe", () => {
    const { v } = corre("setvard L a;b;c\ntoken.set L 2 z\nsetvard M a\ntoken.set M 1 z");
    assert.equal(v("L"), "a;b;z");
    assert.equal(v("M"), "a");
  });
  test("token.scramble deja un `;` colgando", () => {
    const { v } = corre("setvard L a;b;c\ntoken.scramble L");
    assert.equal(v("L"), "a;b;c;");
  });
});

describe("svplaysound / svplayrandomsound (la MISMA función que playsound, scriptcmds.cpp:148-151)", () => {
  test("suena como `playsound` y dice que es del servidor", () => {
    const { sonidos } = corre("svplaysound 2 10 ambience/loop.wav\nplaysound 2 10 ambience/loop.wav");
    assert.equal(sonidos.length, 2);
    assert.equal(sonidos[0].a, "ambience/loop.wav");
    assert.equal(sonidos[0].volumen, 1);
    assert.equal(sonidos[0].canal, 2);
    assert.equal(sonidos[0].servidor, true);
    assert.equal(sonidos[1].servidor, false);
  });
  test("al cortar (volumen 0) el del servidor manda `common/null.wav` (:4781)", () => {
    const { sonidos } = corre("svplaysound 2 0 ambience/loop.wav\nplaysound 2 0 ambience/loop.wav");
    assert.equal(sonidos[0].a, "common/null.wav");
    assert.equal(sonidos[0].corta, true);
    assert.equal(sonidos[1].a, "ambience/loop.wav");
  });
  test("svplayrandomsound sortea (:4730) y no lee atenuación ni tono (:4739)", () => {
    const { sonidos } = corre("svplayrandomsound 1 5 a.wav b.wav c.wav", { azar: (lo, hi) => hi });
    assert.equal(sonidos[0].a, "c.wav");
    assert.equal(sonidos[0].atenuacion, null);
    const { sonidos: s2 } = corre("svplaysound 1 5 a.wav 0.5 120");
    assert.equal(s2[0].atenuacion, 0.5);
    assert.equal(s2[0].tono, 120);
  });
});

describe("sound.play3d / svsound.play3d (scriptcmds.cpp:6698-6716)", () => {
  test("el 5.º es el CANAL y el 6.º el tono, aunque el comentario diga otra cosa", () => {
    const { en3d } = corre("setvard P (10,20,30)\nsvsound.play3d magic/pulsemachine_noloop.wav 8 P 0.8 5 100");
    assert.equal(en3d.length, 1);
    assert.equal(en3d[0].a, "magic/pulsemachine_noloop.wav");
    assert.equal(en3d[0].volumen, 0.8);
    assert.deepEqual(en3d[0].origen, [10, 20, 30]);
    assert.equal(en3d[0].atenuacion, 0.8);
    assert.equal(en3d[0].canal, 5);
    assert.equal(en3d[0].tono, 100);
  });
  test("sin tope de volumen y sin saltarse `none`; con menos de tres, nada", () => {
    const { en3d } = corre("sound.play3d none 25 (0,0,0)\nsound.play3d x.wav 10");
    assert.equal(en3d.length, 1);
    assert.equal(en3d[0].a, "none");
    assert.equal(en3d[0].volumen, 2.5);
    assert.equal(en3d[0].canal, 0);
  });
});
