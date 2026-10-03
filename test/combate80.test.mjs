// EL COMBATE CONTRA UN BICHO PEQUEÑO, MEDIDO — experimento 80.
//
// Tres síntomas que el jugador ve y que ninguna prueba ni ninguna sonda de las
// que había podía ver, porque **las tres sondas de combate del proyecto miden
// todas contra goblins y zombis** y aquí el fallo está en lo pequeño:
//
//   1. el bicho hostil ataca y su animación hace cosas raras;
//   2. la espada suena a golpe contra piedra con una rata delante;
//   3. y no le hace daño hasta que te pegas mucho más.
//
// Esto mide la REGLA. El viaje entero lo mide `sondas/edana80.mjs`.
//
// ── LO QUE CREÍ Y NO ERA, QUE VA AQUÍ PORQUE NO SE PUEDE VOLVER A DEDUCIR ──
//
// El primer diagnóstico fue «el ciclo de pensar es 0,1 s, así que el ataque se
// corta en el fotograma siguiente». La primera versión de esta prueba salió
// **verde con el código sin arreglar**, y la razón es que el ciclo de pensar
// NO es 0,1 s mientras el bicho no tiene objetivo: es 2,0 s
// (`CYCLE_TIME_IDLE`, base_npc_attack_new.script:95), y el reloj se rearma en
// la PRIMERA línea de `npcatk_hunt` —`callevent CYCLE_TIME npcatk_hunt`,
// línea 232— o sea **antes** de que `npcatk_settarget` llame a `cycle_up`
// (:433, :1358). Así que el mod también se queda dos segundos parado tras el
// primer golpe, y eso **no se toca**: es suyo.
//
// CORRECCIÓN DEL 94: el 2,0 es de la IA NUEVA, y la rata es de la VIEJA
// (`monsters/base_monster` → `base_npc_attack`), donde el ocioso es 2,8
// (`setvard CYCLE_TIME_IDLE 2.8`, base_npc_attack.script:7) y el bucle es
// `repeatdelay CYCLE_TIME` (:62-63), que se reprograma igual de pronto. El
// razonamiento de arriba vale; el número para la rata es 2,8. Aquí `IA_RATA`
// está escrita a mano sin `cicloOcioso` y sigue pensando con 2,0.
//
// Lo que sí está mal son las dos mitades de la misma pieza que falta, y las
// dos se ven en el cronograma de un ataque:
//
//   A. del SEGUNDO golpe en adelante —con el ciclo ya en 0,1 s— la animación
//      de ataque se corta a los 33 ms, porque `pon()` no refusa nada.
//   B. y en el primero, al acabar el segundo que dura, **nadie la quita**: la
//      rata se queda congelada en el último fotograma del ataque.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { Manada, duracionDe } from "../src/play/manada.js";
import { CICLO } from "../src/play/ia.js";
import { elegirObjetivo, resolverGolpe } from "../src/play/golpe.js";
import { RELACION } from "../src/bsp/razas.js";

// ── la rata de Edana, con sus números de verdad ─────────────────────────────
//
// Salen de `build/edana/bichos.json`, que los sacó del `.script` del mod
// (`monsters/giantrat`) y del `.mdl`. Lo único inventado son las posiciones,
// porque aquí no hay mapa.
//
// `attack` dura 30/30 = 1 s, y ése es el número que importa: es lo que el
// motor no deja interrumpir y lo que tiene que acabar para que se suelte.
const SECUENCIAS_RATA = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 15, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "run", fps: 30, fotogramas: 25, bucle: true, actividad: 4, pesoActividad: 1, avance: [76, 0, 0] },
  { indice: 3, nombre: "attack", fps: 30, fotogramas: 30, bucle: false, actividad: 28, pesoActividad: 1, avance: [0, 0, 0] },
  { indice: 4, nombre: "die", fps: 30, fotogramas: 40, bucle: false, actividad: 36, pesoActividad: 1, avance: [0, 0, 0] },
];

/** La ficha de combate de `monsters/giantrat`, tal como la hornea el extractor. */
const IA_RATA = {
  raza: "vermin", vida: 4, pasea: true, ancho: 32, alto: 32,
  andando: "walk", corriendo: "run", golpe: "attack", muerte: "die",
  alcanceDeGolpe: 48, alcanceDeImpacto: 100, alcanceParaPararse: 10,
  cercaniaDeDestino: 35.2,
  aciertos: { min: 30, max: 30 }, dano: { min: 0.4, max: 0.4 },
  experiencia: 3, parry: 0, tieneQueVerte: true,
  cambioDeObjetivo: 75, esperaDeCambio: { min: 5, max: 10 },
};

function censoDeUnaRata() {
  return {
    mapa: "liso", unidadesPorMetro: 39.37,
    razas: [["vermin", { odia: ["human"] }], ["human", {}]],
    modelos: [{ clave: "rata", carpeta: "bichos/monsters_giant_rat" }],
    colocados: [{
      clase: "msmonster_giantrat", script: "monsters/giantrat", clave: "rata",
      nombre: "Giant Rat", hp: 4, ancho: 32, alto: 32,
      parado: "idle1", andando: "walk", piel: 0,
      escena: [0, 0, 0], yaw: 0, luz: [189, 187, 144],
      hostil: true, relacion: RELACION.ODIO,
      ia: IA_RATA,
    }],
  };
}

/** Un dado fijo: el mismo de `ia_28`, para que dos pasadas den lo mismo. */
function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const hacerRata = (azar = dado(5)) => new Manada(censoDeUnaRata(), {
  secuenciasPorClave: new Map([["rata", SECUENCIAS_RATA]]),
  // El casco del GUION (32×32×32), que es lo que le da `UTIL_SetSize`
  // (msmonsterserver.cpp:244), y no la caja medida de la malla.
  cajasPorClave: new Map([["rata", { min: [-16, -16, 0], max: [16, 16, 32] }]]),
  azar,
});

/** Suelo llano, nada en medio, y UN jugador delante a `aU` unidades. */
function arnesConJugador(aU = 40) {
  return {
    libre: () => true,
    suelo: () => 0,
    objetivos: () => [{
      id: "jugador", donde: [aU, 0, 0], esJugador: true, relacion: RELACION.ODIO,
    }],
    veA: () => true,
    golpear: () => {},
  };
}

/**
 * EL CRONOGRAMA DE LA ANIMACIÓN, que es el instrumento de todo esto.
 *
 * Devuelve los tramos `{ nombre, gen, desde, dura }` por los que pasa la
 * animación del bicho. Se mide por tramos y no por «estuvo puesta alguna
 * vez»: el fallo es justo que se pone y se quita, y un booleano no lo ve.
 */
function cronograma(m, arnes, segundos = 6) {
  const dt = 1 / 60;
  const tramos = [];
  for (let k = 0; k < Math.round(segundos / dt); k++) {
    m.cazar(dt, arnes);
    m.relojes(dt);
    const i = m.instancias[0];
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.nombre === i.anim.nombre && ultimo.gen === i.anim.gen) {
      ultimo.dura += dt;
    } else {
      tramos.push({ nombre: i.anim.nombre, gen: i.anim.gen, desde: k * dt, dura: dt });
    }
  }
  // EL ÚLTIMO TRAMO NO VALE, y esto es el instrumento y no el juego: la ventana
  // de medida lo corta por la mitad. Con el arreglo bien puesto los tramos
  // salían 0,98 / 1,00 / 1,00 / 1,00 / **0,83**, y ese 0,83 era mi reloj
  // acabándose, no un ataque cortado. Medir hasta el borde es medir el borde.
  tramos.pop();
  return tramos;
}

const ataques = (tramos) => tramos.filter((t) => t.nombre === "attack");

/**
 * La tolerancia: DOS pasos de simulación, 33 ms.
 *
 * No es holgura por gusto: el tramo empieza a contarse en el paso en que ya se
 * lee la animación puesta, así que el primero pierde un `dt`, y el último lo
 * pierde al vencer el candado. Pedir el milisegundo exacto mediría la rejilla
 * del bucle. Con 33 ms, los 120 ms del fallo siguen a 870 ms de pasar.
 */
const HOLGURA = 2 / 60;

describe("1. la animación de ataque de un bicho hostil", () => {
  test("los números con los que se compara están escritos, no deducidos", () => {
    // `attack` son 30 fotogramas a 30 fps. Va a mano: pedirle la duración a la
    // misma función que se mide no mediría nada (la trampa del 75).
    assert.equal(duracionDe(SECUENCIAS_RATA[3]), 1);
    // Y los dos relojes del mod, que son los que explican el cronograma.
    assert.equal(CICLO.ocioso, 2.0);     // CYCLE_TIME_IDLE
    assert.equal(CICLO.combate, 0.1);    // CYCLE_TIME_BATTLE
  });

  test("control positivo: la rata ataca más de una vez", () => {
    const t = ataques(cronograma(hacerRata(), arnesConJugador(40)));
    assert.ok(t.length >= 2, `sólo atacó ${t.length} vez/veces: no hay nada que medir`);
  });

  test("A. ningún ataque se corta antes de acabar — `CAnimOnce`", () => {
    // `CAnimOnce::CanChangeTo` devuelve `m_fSequenceFinished`
    // (monsteranimation.cpp:217-220) y `SetAnimation` le pregunta antes de
    // cambiar nada (msmonsterserver.cpp:2023). Una animación de una sola vez
    // no la interrumpe nadie, y Thothie dejó el síntoma escrito encima de la
    // guarda: «if you 'dance' around an affected monster, he can never attack,
    // as his swing anims break».
    //
    // Sin la guarda, del segundo golpe en adelante el ciclo ya va a 0,1 s y la
    // de correr le pisa el ataque a los 33 ms.
    const t = ataques(cronograma(hacerRata(), arnesConJugador(40)));
    const corto = t.find((x) => x.dura < 1 - HOLGURA);
    assert.equal(
      corto, undefined,
      `un ataque duró ${((corto?.dura ?? 0) * 1000).toFixed(0)} ms de los 1000 del archivo` +
      ` (tramos: ${JSON.stringify(t.map((x) => [x.desde.toFixed(2), x.dura.toFixed(2)]))})`
    );
  });

  test("B. y al acabar se suelta: nadie se queda congelado en el ataque", () => {
    // La otra mitad, y es la que se ve en el primer golpe. `CMSMonster::Think`
    // corre cada 0,1 s (msmonsterserver.cpp:511) y **en cada uno** vuelve a
    // pedir la animación de moverse o la de reposo:
    //
    //     if (HasConditions(MONSTER_HASMOVEDEST)) SetAnimation(..., m_MoveAnim);
    //     else if (m_IdleAnim.len())              SetAnimation(..., m_IdleAnim);
    //                                        msmonsterserver.cpp:586-600
    //
    // Mientras el ataque corre, `CanChangeTo` lo rechaza; en cuanto acaba, lo
    // acepta. O sea que la de ataque dura lo que dura el archivo y **ni un
    // fotograma más**. En el puerto no hay quien la quite: la rata se queda
    // clavada en el último fotograma hasta el siguiente ciclo de pensar, que
    // con el reloj ocioso es un segundo entero de más.
    const t = ataques(cronograma(hacerRata(), arnesConJugador(40)));
    const largo = t.find((x) => x.dura > 1 + HOLGURA);
    assert.equal(
      largo, undefined,
      `un ataque se quedó puesto ${((largo?.dura ?? 0) * 1000).toFixed(0)} ms, y el archivo dura 1000`
    );
  });
});

// ── 2. la espada contra algo pequeño ───────────────────────────────────────
//
// Los números de esta mitad son todos del juego y van escritos a mano, con su
// procedencia al lado, porque son LA REGLA: calcularlos con la misma función
// que se mide no mediría nada (la trampa del 75).

/** `alcance 60` de `swords_rsword`, en `build/gatecity/armas.json`. */
const ALCANCE_ESPADA = 60;
/** `CAJA.ojo` = 64 unidades (src/play/movimiento.js, del experimento 02). */
const OJO = 64;
/** La mitad del alto del guion de la rata: `setsize 32 32` → centro a 16. */
const CENTRO_RATA = 16;
/** El radio del jugador (16) más el de la rata (16): lo que ya separan los cuerpos. */
const CUERPOS = 32;

/** Una rata a `h` unidades en horizontal, con el ojo del jugador en el origen. */
const rataA = (h) => ({
  id: "rata", vivo: true, centro: [h, CENTRO_RATA - OJO, 0],
});

describe("2. por qué no se le puede pegar a una rata", () => {
  test("la aritmética de la franja, escrita y no deducida", () => {
    // El radio HORIZONTAL que le queda a la esfera cuando tiene que bajar 48
    // unidades para llegar al centro de la rata.
    const vertical = OJO - CENTRO_RATA;
    assert.equal(vertical, 48);
    const horizontal = Math.sqrt(ALCANCE_ESPADA ** 2 - vertical ** 2);
    assert.equal(horizontal, 36);
    // Y los cuerpos ya separan 32. La franja útil de la esfera son CUATRO
    // unidades, diez centímetros: eso es «tienes que pegar mucho más cerca».
    assert.equal(horizontal - CUERPOS, 4);
  });

  test("control positivo: dentro de la franja, la esfera la encuentra", () => {
    const r = elegirObjetivo({
      desde: [0, 0, 0], mirando: [1, 0, 0],
      alcance: ALCANCE_ESPADA, candidatos: [rataA(34)],
    });
    assert.ok(r, "a 34 unidades la esfera sí llega: si no, no hay franja que medir");
  });

  test("y a 40 unidades la esfera NO llega, que es el caso del jugador", () => {
    const r = elegirObjetivo({
      desde: [0, 0, 0], mirando: [1, 0, 0],
      alcance: ALCANCE_ESPADA, candidatos: [rataA(40)],
    });
    assert.equal(r, null);
  });

  test("la línea sí la alcanza, y eso es DAÑO y no un sonido", () => {
    // `MSTraceLine(..., dont_ignore_monsters, ...)` y `DoDamage(Damage, pHit)`
    // — giattack.cpp:1636-1646. El segundo intento del motor.
    const rata = rataA(40);
    const r = resolverGolpe({
      desde: [0, 0, 0], mirando: [1, 0, 0], alcance: ALCANCE_ESPADA,
      candidatos: [rata],
      // La traza del mundo con los bichos puestos: apuntando a la rata, la toca.
      linea: () => ({ tipo: "bicho", objetivo: rata }),
    });
    assert.ok(r, "no se dio a nada");
    assert.equal(r.mundo, undefined, "un bicho no es «el mundo»");
    assert.equal(r.objetivo, rata);
    assert.equal(r.por, "linea");
  });

  test("UN BICHO NUNCA SUENA A PIEDRA, ni cuando lo coge la línea", () => {
    // El fallo que el jugador OYE. `CMSMonster::CounterEffect` manda
    // `CE_HITMONSTER` → `game_hitnpc` (msmonsterserver.cpp:2438-2445), y
    // `hitwall` sólo sale de `CE_HITWORLD` (entity.cpp:20-26, genericitem.cpp:814).
    // El puerto trazaba un rayo SIN filtrar a los bichos y tocaba el cilindro de
    // la rata: clang de pared, cero daño, y el jugador oyendo un golpe que no
    // existe. Son dos rayos en la misma función y sólo uno filtraba.
    const rata = rataA(40);
    for (const tipo of ["bicho", "rompible"]) {
      const r = resolverGolpe({
        desde: [0, 0, 0], mirando: [1, 0, 0], alcance: ALCANCE_ESPADA,
        candidatos: [rata], linea: () => ({ tipo, objetivo: rata }),
      });
      assert.equal(r.mundo, undefined, `un ${tipo} salió marcado como mundo`);
      assert.ok(r.objetivo, `un ${tipo} salió sin objetivo al que herir`);
    }
  });

  test("y la pared sí es la pared: ahí el `hitwall` es correcto", () => {
    // El control negativo de la de arriba. Sin esto, «nunca suena a piedra» se
    // podría cumplir no sonando nunca, que es otro juego.
    const r = resolverGolpe({
      desde: [0, 0, 0], mirando: [1, 0, 0], alcance: ALCANCE_ESPADA,
      candidatos: [], linea: () => ({ tipo: "mundo" }),
    });
    assert.deepEqual(r, { mundo: true, por: "linea" });
  });

  test("y sin nada delante no se da a nada, que no es lo mismo que a la pared", () => {
    const r = resolverGolpe({
      desde: [0, 0, 0], mirando: [1, 0, 0], alcance: ALCANCE_ESPADA,
      candidatos: [], linea: () => null,
    });
    assert.equal(r, null);
  });

  test("la esfera manda sobre la línea: es el primer intento del motor", () => {
    // El orden importa: la esfera se queda con el MÁS CERCANO del cono, y la
    // línea con lo que haya en la cruceta. Al revés, un goblin pegado al hombro
    // dejaría de recibir el golpe en cuanto apuntaras un poco al lado.
    const cerca = rataA(34);
    const lejos = rataA(40);
    const r = resolverGolpe({
      desde: [0, 0, 0], mirando: [1, 0, 0], alcance: ALCANCE_ESPADA,
      candidatos: [cerca], linea: () => ({ tipo: "bicho", objetivo: lejos }),
    });
    assert.equal(r.objetivo, cerca);
    assert.equal(r.por, "esfera");
  });
});

// ── 3. el cuerpo con el que choca un bicho ─────────────────────────────────

describe("3. el colisionador sale del guion y no de la malla", () => {
  test("el casco de la rata es el `setsize` de su guion: 32 x 32", async () => {
    // `UTIL_SetSize(pev, -(m_Width/2), ..., m_Height)` — msmonsterserver.cpp:244,
    // con `m_Width`/`m_Height` leídos del `setsize` del guion (npcscript.cpp:201
    // y :210). La caja medida de la malla de la rata da 33,5 x 28,5, y el mismo
    // bicho tenía DOS tamaños: `candidatosDeGolpe()` ya usaba el del guion.
    const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
    const { mundoLiso } = await import("../src/red/liso.js");
    const m = await mundoLiso({});
    const manada = hacerRata();
    const { solidosDeBichos } = await import("../src/play/solidos.js");
    const s = solidosDeBichos(manada, m.world.world, RAPIER, { unidadesPorMetro: 39.37 });
    assert.equal(s.n, 1);
    const p = s.puestos[0];
    assert.equal(p.deDonde, "el guion");
    assert.equal(Math.round(p.alto * 39.37), 32, "el alto es el del guion");
    assert.equal(Math.round(p.radio * 39.37 * 2), 32, "y el ancho también");
    assert.deepEqual(s.medidosDeLaMalla, []);
    assert.deepEqual(s.sinTamano, []);
  });

  test("y sin `setsize` se cae a la malla, pero lo DICE", async () => {
    // Son 5 de los 74 de `gertenheld_forest2`, y 0 de Gate City y 0 de Edana:
    // otro hueco que sólo enseña el tercer mapa. Dejarlos sin colisionador
    // cambiaría un tamaño flojo por un pueblo que se atraviesa, y hacerlo en
    // silencio es el filtro del 63.
    const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
    const { mundoLiso } = await import("../src/red/liso.js");
    const { solidosDeBichos } = await import("../src/play/solidos.js");
    const m = await mundoLiso({});
    const censo = censoDeUnaRata();
    // Una rata sin `setsize`: ni en la ficha de IA ni en la colocación.
    censo.colocados[0].ancho = 0; censo.colocados[0].alto = 0;
    censo.colocados[0].ia = { ...censo.colocados[0].ia, ancho: 0, alto: 0 };
    const manada = new Manada(censo, {
      secuenciasPorClave: new Map([["rata", SECUENCIAS_RATA]]),
      cajasPorClave: new Map([["rata", { min: [-17, -31.8, 0], max: [16.5, 54.5, 28.4] }]]),
    });
    const s = solidosDeBichos(manada, m.world.world, RAPIER, { unidadesPorMetro: 39.37 });
    assert.equal(s.n, 1, "sigue teniendo cuerpo");
    assert.match(s.puestos[0].deDonde, /malla/);
    assert.deepEqual(s.medidosDeLaMalla, ["monsters/giantrat"]);
  });

  test("y sin NADA no se inventa un cuerpo, y también lo dice", async () => {
    // El control negativo del de arriba: «se cae a la malla» no puede cumplirse
    // inventando un tamaño cuando no hay ninguno.
    const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
    const { mundoLiso } = await import("../src/red/liso.js");
    const { solidosDeBichos } = await import("../src/play/solidos.js");
    const m = await mundoLiso({});
    const censo = censoDeUnaRata();
    censo.colocados[0].ancho = 0; censo.colocados[0].alto = 0;
    censo.colocados[0].ia = { ...censo.colocados[0].ia, ancho: 0, alto: 0 };
    const manada = new Manada(censo, {
      secuenciasPorClave: new Map([["rata", SECUENCIAS_RATA]]),
      cajasPorClave: new Map(),
    });
    const s = solidosDeBichos(manada, m.world.world, RAPIER, { unidadesPorMetro: 39.37 });
    assert.equal(s.n, 0);
    assert.deepEqual(s.sinTamano, ["monsters/giantrat"]);
  });
});
