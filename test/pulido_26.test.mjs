// EL 26: las ranuras que se guardan, la barra de carga y el aterrizaje.
//
// Tres huecos que el jugador notó y que el motor tiene resueltos con sus
// rarezas: `sv_character.cpp:696` y `player.cpp:6514` (las ranuras al disco),
// `vgui_health.h:239-296` (la barra), y `PM_CheckFalling` más el dado de cinco
// caras de `player.cpp:2127` (el golpe contra el suelo). Lo que aquí parece un
// fallo lo es, se porta con el fallo, y la prueba lo deja escrito.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  Ranuras, TIPO, MAX_RANURAS, guardarRanuras, cargarRanuras,
} from "../src/play/ranuras.js";
import { crearPersonaje, abrirPersonaje, RANURAS_DEL_PERSONAJE } from "../src/juego/personaje.js";
import { nivelDeCarga, VozDeLaCarga, cargaDe, SONIDO_DE_CARGA } from "../src/play/golpe.js";
import { sonidoDeCaida, CAIDA, CARAS_DE_LA_CAIDA } from "../src/play/sonido.js";
import { cargaEn } from "../src/play/hud.js";

const ESPADA = { que: "empunar", id: "swords_rsword", nombre: "Rusty Sword" };

describe("las ranuras se guardan en el personaje", () => {
  test("se guardan las 36, vacías incluidas", () => {
    const r = new Ranuras();
    const g = r.aGuardar();
    assert.equal(g.length, MAX_RANURAS);
    assert.equal(g.length, RANURAS_DEL_PERSONAJE);
    assert.ok(g.every((x) => x === null));
  });

  test("una de objeto guarda su tipo y su identificador", () => {
    const r = new Ranuras();
    r.pulsar(3); r.paso(3, ESPADA);
    const g = r.aGuardar();
    assert.deepEqual(g[2], { tipo: TIPO.objeto, id: "swords_rsword" });
  });

  test("y vuelve con su nombre, que no se guarda porque sale del objeto", () => {
    const g = guardarRanuras([ESPADA]);
    const { ranuras } = cargarRanuras(g, {
      objetos: [{ id: "swords_rsword" }],
      nombres: { swords_rsword: "Rusty Short Sword" },
    });
    assert.equal(ranuras[0].nombre, "Rusty Short Sword");
    assert.equal(ranuras[0].que, "empunar");
  });

  // `QuickSlot.Active = bFound` (player.cpp:6528). Ni mensaje ni pitido.
  test("una ranura con un objeto que ya no llevas SE APAGA, y calla", () => {
    const g = guardarRanuras([ESPADA]);
    const { ranuras, perdidas } = cargarRanuras(g, { objetos: [{ id: "otra_cosa" }] });
    assert.equal(ranuras[0], null);
    assert.deepEqual(perdidas, [{ ranura: 0, id: "swords_rsword" }]);
  });

  // Y ésta es la mitad que NO comprueba: `if (Active && Type == QS_ITEM)`.
  test("las de hechizo y munición NO se comprueban contra nada", () => {
    const g = guardarRanuras([
      { que: "preparar", hechizo: "spell_glow" },
      { que: "elegirMunicion", id: "proj_arrow_generic", infinita: true },
    ]);
    const { ranuras, perdidas } = cargarRanuras(g, { objetos: [] });
    assert.equal(perdidas.length, 0, "con la mochila vacía no se pierde ninguna de las dos");
    assert.equal(ranuras[0].que, "preparar");
    assert.equal(ranuras[1].infinita, true);
  });

  test("el tipo de la munición infinita sobrevive al viaje", () => {
    const g = guardarRanuras([{ que: "elegirMunicion", id: "proj_bolt_generic", infinita: true }]);
    assert.equal(g[0].tipo, TIPO.flecha);
    assert.equal(g[0].infinita, true);
  });

  test("un personaje nuevo trae 36 ranuras vacías", () => {
    const p = crearPersonaje({ nombre: "Probador", arma: null });
    assert.equal(p.ranuras.length, RANURAS_DEL_PERSONAJE);
    assert.ok(p.ranuras.every((x) => x === null));
  });

  test("uno de antes del 26 se abre y se le rellenan", () => {
    const p = crearPersonaje({ nombre: "Antiguo", arma: null });
    delete p.ranuras;
    const { personaje, avisos } = abrirPersonaje(p);
    assert.equal(personaje.ranuras.length, RANURAS_DEL_PERSONAJE);
    assert.ok(!avisos.some((a) => a.includes("ranuras")), "rellenar no es un aviso");
  });

  // Lo que permitió a MSR subir de 12 a 36 sin mutilar a nadie: el que lee no
  // decide cuántas hay.
  test("uno con MÁS ranuras que este código no se recorta, y lo avisa", () => {
    const p = crearPersonaje({ nombre: "Del futuro", arma: null });
    p.ranuras = new Array(48).fill(null);
    p.ranuras[47] = { tipo: TIPO.objeto, id: "algo" };
    const { personaje, avisos } = abrirPersonaje(p);
    assert.equal(personaje.ranuras.length, 48);
    assert.ok(avisos.some((a) => a.includes("48 ranuras")));
  });

  test("y las de 12 de un personaje viejo caen en las doce primeras", () => {
    const viejo = new Array(12).fill(null);
    viejo[11] = { tipo: TIPO.objeto, id: "swords_rsword" };
    const { ranuras } = cargarRanuras(viejo, { objetos: [{ id: "swords_rsword" }] });
    assert.equal(ranuras.length, MAX_RANURAS);
    assert.ok(ranuras[11]);
    assert.equal(ranuras[12], null);
  });

  test("una ranura guardada se puede usar al volver", () => {
    const g = guardarRanuras([ESPADA]);
    const { ranuras } = cargarRanuras(g, { objetos: [{ id: "swords_rsword" }] });
    const r = new Ranuras({ guardadas: ranuras });
    r.pulsar(1);
    const orden = r.soltar(1);
    assert.equal(orden.id, "swords_rsword");
    assert.equal(orden.ranura, 0);
  });
});

describe("la barra de carga", () => {
  // El mismo `GET_CHARGE_FROM_TIME` se aplica a los segundos y al número de
  // nivel, así que los niveles caen en segundos enteros. Es la comprobación de
  // que las dos mitades encajan.
  test("los niveles caen en segundos enteros", () => {
    for (const s of [1, 2, 3, 4]) {
      assert.equal(nivelDeCarga(cargaDe(s)).nivel, s + 1,
        `a los ${s} s justos la carga toca el umbral y el nivel sube`);
    }
    assert.equal(nivelDeCarga(cargaDe(0.99)).nivel, 1);
    assert.equal(nivelDeCarga(cargaDe(1.01)).nivel, 2);
  });

  test("el primer nivel se pinta NEGRO, porque el color se elige antes de sumar", () => {
    assert.deepEqual(nivelDeCarga(0.5).rgb, [0, 0, 0]);
  });

  test("el segundo es rojo y el tercero más rojo", () => {
    assert.deepEqual(nivelDeCarga(cargaDe(1.5)).rgb, [100, 0, 0]);
    assert.deepEqual(nivelDeCarga(cargaDe(2.5)).rgb, [200, 0, 0]);
  });

  // `if (vChargeR > 255) vChargeR -= 255;` — resta, no satura.
  // `if (vChargeR > 255) { vChargeR -= 255; vChargeG += 100; }`: al desbordar
  // RESTA 255 en vez de saturar, así que el canal vuelve hacia atrás y la barra
  // se oscurece al subir de nivel. No es una escala: es una rueda.
  test("y al desbordar el canal VUELVE ATRÁS en vez de saturar", () => {
    assert.deepEqual(nivelDeCarga(cargaDe(3.5)).rgb, [45, 100, 0],
      "el cuarto nivel: el rojo cae de 200 a 45 y aparece el verde");
    const rojos = [];
    for (let s = 0.5; s < 8; s += 1) rojos.push(nivelDeCarga(cargaDe(s)).rgb[0]);
    assert.deepEqual(rojos, [0, 100, 200, 45, 145, 245, 90, 190]);
    assert.ok(rojos.some((r, i) => i > 0 && r < rojos[i - 1]),
      "hay al menos un nivel más oscuro que el anterior");
  });

  test("el número de la etiqueta va uno por debajo del nivel", () => {
    assert.equal(nivelDeCarga(0.5).etiqueta, " ", "en el primero, un espacio");
    assert.equal(nivelDeCarga(0.5).mostrado, 0);
    assert.equal(nivelDeCarga(cargaDe(1.5)).etiqueta, "1", "en el segundo pone 1");
    assert.equal(nivelDeCarga(cargaDe(2.5)).etiqueta, "2");
  });

  test("la barra se VACÍA en cada nivel: la fracción vuelve a empezar", () => {
    const a = nivelDeCarga(cargaDe(1.1)).fraccion;
    const b = nivelDeCarga(cargaDe(1.9)).fraccion;
    assert.ok(a < 0.2 && b > 0.8, `al empezar el tramo ${a} y al acabarlo ${b}`);
    // En el primer nivel no se normaliza: es la carga a pelo (`if (nivel != 1)`).
    assert.equal(nivelDeCarga(0.5).fraccion, 0.5);
  });

  test("una carga absurda no cuelga el bucle", () => {
    const n = nivelDeCarga(1e6);
    assert.ok(Number.isFinite(n.nivel));
  });

  test("suena al subir de nivel, y sólo entonces", () => {
    const voz = new VozDeLaCarga();
    assert.equal(voz.paso(0), null, "sin cargar no suena");
    assert.equal(voz.paso(0.5), null, "el primer nivel tampoco: arranca en 1");
    assert.equal(voz.paso(cargaDe(1.5)), SONIDO_DE_CARGA, "al segundo sí");
    assert.equal(voz.paso(cargaDe(1.6)), null, "y no repite dentro del mismo");
    assert.equal(voz.paso(cargaDe(2.5)), SONIDO_DE_CARGA);
  });

  // `mCurChargeLevel` no se pone a cero al soltar, y aun así la segunda carga
  // suena: al recargar desde cero el primer fotograma está en el nivel 1 y la
  // asignación incondicional devuelve el campo a 1. Lo que guarda es el nivel
  // del fotograma anterior, no un máximo histórico — y esta prueba está aquí
  // porque la primera versión lo portó como un máximo y parecía razonable.
  test("la segunda carga SÍ suena, porque se recarga desde cero", () => {
    const voz = new VozDeLaCarga();
    voz.paso(cargaDe(1.5));
    voz.paso(cargaDe(2.5));           // hasta el tercero
    voz.paso(0);                      // suelta: no se asigna nada
    voz.paso(0.1);                    // y vuelve a cargar, desde el nivel 1
    assert.equal(voz.paso(cargaDe(1.5)), SONIDO_DE_CARGA);
  });

  test("pero saltar al nivel 3 sin pasar por el 1 se lo come", () => {
    const voz = new VozDeLaCarga();
    voz.paso(cargaDe(2.5));           // nivel 3 de golpe: suena
    voz.paso(0);
    assert.equal(voz.paso(cargaDe(2.5)), null, "el campo sigue en 3");
  });

  // La errata de precedencia de C, que ya estaba portada en el 24: aquí se
  // comprueba que sigue portada y se deja escrito lo que se quería.
  test("las dos barras salen a 304 ∓ 30 y el separador no se usa nunca", () => {
    const [derecha, izquierda] = cargaEn(640, 480);
    assert.equal(derecha.x, 304 - 30);
    assert.equal(izquierda.x, 304 + 30);
    assert.equal(izquierda.x - (derecha.x + derecha.w), 30,
      "con el separador puesto el hueco sería de 2 px, no de 30");
  });
});

describe("aterrizar, que es lo único que suena de un salto", () => {
  test("por debajo de 350 u/s no suena nada", () => {
    const c = sonidoDeCaida(CAIDA.avisa - 1);
    assert.equal(c.volumen, 0);
    assert.equal(c.voz, null);
  });

  test("a partir de 350 suena, y el volumen sube por tramos", () => {
    assert.equal(sonidoDeCaida(350).volumen, 0.85, "350 ya pasa de la mitad de 580");
    assert.equal(sonidoDeCaida(CAIDA.segura).volumen, 0.85);
    assert.equal(sonidoDeCaida(CAIDA.segura + 1).volumen, 1);
  });

  test("y por encima de 580 grita de dolor", () => {
    assert.equal(sonidoDeCaida(700).voz, "player/fallpain3.wav");
    assert.equal(sonidoDeCaida(400).voz, null);
  });

  // `if (waterlevel > 0) { }` — el cuerpo está vacío en el motor.
  test("en el agua no cambia nada: se queda el 0,5 de fábrica", () => {
    assert.equal(sonidoDeCaida(900, { enAgua: true }).volumen, 0.5);
    assert.equal(sonidoDeCaida(900, { enAgua: true }).voz, null, "y no grita");
  });

  // Para entrar hay que caer a 350 o más y la rama pide menos de 200.
  test("la rama del volumen CERO es código muerto", () => {
    let ceros = 0;
    for (let v = CAIDA.avisa; v < 2000; v += 1) if (sonidoDeCaida(v).volumen === 0) ceros++;
    assert.equal(ceros, 0, "una vez pasado el umbral, un aterrizaje SIEMPRE suena");
  });

  test("con daño se tira un dado de cinco caras", () => {
    const caras = new Set();
    for (let i = 0; i < 5; i++) {
      caras.add(sonidoDeCaida(900, { conDano: true, azar: () => i / 5 }).golpe);
    }
    assert.equal(caras.size, 5);
    assert.deepEqual([...caras].sort(), [...CARAS_DE_LA_CAIDA].sort());
  });

  test("y sin daño no hay dado", () => {
    assert.equal(sonidoDeCaida(900, { conDano: false }).golpe, null);
  });

  // Tres de las cinco son de `common/`, que es de Valve y el mod no trae.
  test("tres de las cinco caras son mudas EN EL JUEGO", () => {
    const deValve = CARAS_DE_LA_CAIDA.filter((c) => c.startsWith("common/"));
    assert.equal(deValve.length, 3);
  });
});
