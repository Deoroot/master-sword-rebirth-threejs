// SUBIR DE NIVEL, lo que se ve. `src/play/nivel.js`.
//
// La cuenta de la experiencia la comprueba `test/juego_personaje.test.mjs`.
// Esto es lo que el 41 añade: el cartel con su efecto de máquina de escribir,
// los dos avisos, el sonido y la lluvia de colores.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CARTEL, VECES, SONIDO, EFECTO, CHISPA, CL_GRAVITY,
  subida, colorDeLetra, finDelAguante, mezclaFinal,
  chispasDeUnaVuelta, vueltas, nombreDeHabilidad, nombreDePropiedad,
} from "../src/play/nivel.js";

describe("los textos de una subida", () => {
  test("el cartel es «Habilidad Propiedad +1»", () => {
    const s = subida("swordsmanship.power", "Rowan");
    assert.equal(s.carteles[0], "Swordsmanship Power +1");
  });

  test("y se manda DOS VECES, que es el fallo del motor", () => {
    const s = subida("swordsmanship.power", "Rowan");
    assert.equal(VECES, 2);
    assert.equal(s.carteles.length, 2);
    // Idénticos: las dos llamadas de `playerstats.cpp:153` y `:157` pasan lo
    // mismo. Si alguien «arreglara» el puerto mandando uno, esto se pone rojo.
    assert.equal(s.carteles[0], s.carteles[1]);
  });

  test("pero en magia los dos NO son iguales, y el primero miente", () => {
    // (A) indexa `SkillTypeList` —las tres propiedades de armas— con el índice
    // de la ESCUELA. `ice` es la 1, así que sale «Balance», que en magia no
    // existe; `lightning`, la 2, sale «Power».
    const s = subida("spellcasting.ice", "Rowan");
    assert.equal(s.esMagia, true);
    assert.equal(s.carteles[0], "Spell Casting Balance +1");
    assert.equal(s.carteles[1], "Spell Casting Ice +1");
    assert.notEqual(s.carteles[0], s.carteles[1]);
    assert.equal(subida("spellcasting.lightning").carteles[0], "Spell Casting Power +1");
  });

  test("y con las escuelas 3 y 4 el motor lee FUERA del array de tres", () => {
    // `divination` es la 3 y `affliction` la 4; `SkillTypeList` tiene tres. En
    // C eso es memoria de al lado; aquí sale `undefined` y se escribe «???»
    // para que en pantalla se vea que ahí no hay nada que leer.
    assert.equal(subida("spellcasting.divination").carteles[0], "Spell Casting ??? +1");
    assert.equal(subida("spellcasting.affliction").carteles[0], "Spell Casting ??? +1");
    // El segundo, el bueno, sí dice la escuela.
    assert.equal(subida("spellcasting.affliction").carteles[1], "Spell Casting Affliction +1");
  });

  test("el aviso de tu consola nombra la habilidad, no la propiedad", () => {
    assert.equal(subida("smallarms.balance").adepto, "You become more adept at Small Arms.");
  });

  test("y el que ven todos lleva el nombre en el título y el verbo en el cuerpo", () => {
    const s = subida("axehandling.proficiency", "Rowan");
    assert.equal(s.anuncio.titulo, "Rowan has gained a level!");
    // Sin sujeto: así lo escribe el guion.
    assert.equal(s.anuncio.cuerpo, "has gained experience in Axe Handling");
  });

  test("y sólo la magia añade la escuela al cuerpo", () => {
    assert.equal(subida("spellcasting.fire", "R").anuncio.cuerpo,
      "has gained experience in Spell Casting Fire");
  });

  test("el sonido es el del guion, no uno de la carpeta de la interfaz", () => {
    assert.equal(SONIDO, "magic/converted_enchp01.wav");
    assert.equal(subida("parry.proficiency").sonido, SONIDO);
  });

  test("los nombres son los del motor", () => {
    assert.equal(nombreDeHabilidad("martialarts"), "Martial Arts");
    assert.equal(nombreDePropiedad("proficiency"), "Proficiency");
    assert.equal(nombreDePropiedad("lightning"), "Lightning");
  });
});

describe("el cartel: el efecto 2 de `CHudMessage`", () => {
  const TEXTO = "Swordsmanship Proficiency +1";
  const LARGO = TEXTO.length;

  test("son los catorce parámetros del motor", () => {
    assert.deepEqual(CARTEL.color1, [0, 128, 0]);
    assert.deepEqual(CARTEL.color2, [178, 119, 0]);
    assert.equal(CARTEL.x, 0.02);
    assert.equal(CARTEL.y, 0.6);
    assert.equal(CARTEL.efecto, 2);
    assert.equal(CARTEL.entrada, 0.02);
    assert.equal(CARTEL.aguante, 2.0);
    assert.equal(CARTEL.salida, 3.0);
    assert.equal(CARTEL.fx, 0.6);
  });

  test("una letra que no ha salido todavía se pinta NEGRA, no se salta", () => {
    // El `srcRed = srcGreen = srcBlue = 0` de message.cpp:155. La letra está en
    // la pantalla desde el primer fotograma; lo que no está es su color.
    assert.deepEqual(colorDeLetra(10, 0, { largo: LARGO }), [0, 0, 0]);
  });

  test("la primera sale en 0,02 y no en cero: `charTime += fadein` va ANTES", () => {
    assert.deepEqual(colorDeLetra(0, 0.019, { largo: LARGO }), [0, 0, 0]);
    assert.notDeepEqual(colorDeLetra(0, 0.02, { largo: LARGO }), [0, 0, 0]);
  });

  test("recién salida tira al ÁMBAR, y no llega del todo: la mezcla es 254", () => {
    const c = colorDeLetra(0, 0.02, { largo: LARGO });
    // mezcla = trunc(255 − 0,5) = 254. r = (0·1 + 178·254) >> 8 = 176.
    assert.deepEqual(c, [176, 118, 0]);
    // El positivo: con la mezcla a 255 sería (178·255)>>8 = 177. Un punto de
    // diferencia, y es el `+ 0.5` truncado del motor.
    assert.notDeepEqual(c, [177, 118, 0]);
  });

  test("y pasado el `fxtime` se queda en VERDE — pero en 127, no en 128", () => {
    // El `>> 8` de message.cpp:184-186 divide por 256 una mezcla que va a 255.
    // Un verde 128 sale 127 y nunca 128. Es de Valve y va portado.
    assert.deepEqual(colorDeLetra(0, 0.02 + CARTEL.fx + 0.01, { largo: LARGO }), [0, 127, 0]);
  });

  test("el aguante empieza cuando ha salido la ÚLTIMA letra", () => {
    // `fadeTime = fadein · length + holdtime`, no `fadein + holdtime`.
    assert.ok(Math.abs(finDelAguante(LARGO) - (0.02 * LARGO + 2.0)) < 1e-9);
    // Con 28 letras eso son 2,56 s antes de empezar a irse, y 3 más para irse:
    // el cartel se ve cinco segundos y medio, no dos.
    assert.ok(finDelAguante(LARGO) + CARTEL.salida > 5.5);
  });

  test("y al final se apaga del todo", () => {
    const fin = finDelAguante(LARGO);
    assert.equal(mezclaFinal(fin, LARGO), 0);
    assert.equal(mezclaFinal(fin + CARTEL.salida, LARGO), 255);
    // Sin tope: el motor deja que se pase y lo corta después.
    assert.ok(mezclaFinal(fin + 2 * CARTEL.salida, LARGO) > 255);
    // Y la letra acaba negra, que es el color al que mezcla.
    assert.deepEqual(colorDeLetra(0, fin + CARTEL.salida, { largo: LARGO }), [0, 0, 0]);
  });

  test("la mezcla del final se TRUNCA, porque `fadeBlend` es un `int`", () => {
    // 255 · (1,5/3) = 127,5 → 127. Con `Math.round` saldría 128.
    assert.equal(mezclaFinal(finDelAguante(LARGO) + 1.5, LARGO), 127);
  });
});

describe("la lluvia de colores", () => {
  test("cuatro segundos, cada décima, cuatro por vuelta: 160", () => {
    assert.equal(EFECTO.duracion, 4.0);
    assert.equal(EFECTO.periodo, 0.1);
    assert.equal(EFECTO.porVuelta, 4);
    assert.equal(vueltas(), 40);
    assert.equal(vueltas() * EFECTO.porVuelta, 160);
  });

  test("la primera luz es VERDE y de tres segundos", () => {
    assert.deepEqual(EFECTO.luz.color, [0, 255, 0]);
    assert.equal(EFECTO.luz.radio, 200);
    assert.equal(EFECTO.luz.vida, 3.0);
  });

  test("nacen en un anillo de 32 unidades, 32 por DEBAJO del origen", () => {
    // O sea a la altura de los pies, no del pecho: `$vec(0,DIST,-32)`.
    assert.equal(EFECTO.anillo.radio, 32);
    assert.equal(EFECTO.anillo.alto, -32);
    // Con un azar fijo, el radio del desplazamiento horizontal es exacto.
    const lote = chispasDeUnaVuelta({ azar: () => 0.25 });
    assert.equal(lote.length, 4);
    for (const c of lote) {
      assert.ok(Math.abs(Math.hypot(c.desplazamiento[0], c.desplazamiento[2]) - 32) < 1e-9);
      assert.equal(c.desplazamiento[1], -32);
    }
  });

  test("y cada una con su color, que es lo que la hace «un montón de colores»", () => {
    let n = 0;
    const azar = () => { n += 0.137; return n % 1; };
    const lote = chispasDeUnaVuelta({ azar });
    const distintos = new Set(lote.map((c) => c.color.join(",")));
    assert.equal(distintos.size, 4);
    for (const c of lote) for (const v of c.color) assert.ok(v >= 0 && v <= 255);
  });

  test("la gravedad es NEGATIVA: suben, no caen", () => {
    assert.equal(CHISPA.gravedad, -0.5);
    // `-frametime · cl_gravity · gravity` con cl_gravity 800 y −0,5 da +400
    // unidades por segundo al cuadrado, hacia arriba.
    assert.equal(-CL_GRAVITY * CHISPA.gravedad, 400);
    // En el segundo que viven suben 200 unidades: cinco metros. Es una fuente.
    assert.equal(0.5 * 400 * CHISPA.vida * CHISPA.vida, 200);
  });

  test("velocidad horizontal y la vertical a cero al nacer", () => {
    const lote = chispasDeUnaVuelta({ azar: () => 1 });
    for (const c of lote) {
      assert.equal(c.velocidad[1], 0);
      assert.ok(Math.abs(c.velocidad[0]) <= CHISPA.velocidad);
      assert.ok(Math.abs(c.velocidad[2]) <= CHISPA.velocidad);
    }
  });

  test("veinte cuadros a treinta por segundo, y el sprite es el de Valve", () => {
    assert.equal(CHISPA.cuadros, 20);
    assert.equal(CHISPA.porSegundo, 30);
    assert.equal(CHISPA.escala, 0.25);
    assert.equal(CHISPA.mezcla, "aditivo");
    assert.equal(EFECTO.sprite, "xflare1.spr");
  });
});
