// EL PASO 5: LOS BICHOS PASAN AL SERVIDOR.
//
// Lo que estas pruebas tienen que demostrar no es que la IA funcione —eso ya lo
// comprueban `juego_ia`, `juego_reaccion` y `consecuencias` desde el 17— sino
// que **la mudanza no la ha cambiado** y que ahora la decide UNA máquina.
//
// Cuatro bloques:
//
//   1. la manada, sin Three y sin navegador: el estado que antes vivía dentro
//      de un nodo de Three.
//   2. lo que viaja: la foto de un bicho, su delta y aplicarla.
//   3. la fauna con física de verdad: el arnés del servidor, y el control
//      positivo del cero que costó la tarde.
//   4. la partida entera: el golpe que se pide, el techo del daño, el
//      rebobinado y la experiencia repartida.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Manada, velocidadDeSecuencia, buscarSecuencia, duracionDe,
  CADAVER, ESPERA_ENTRE_GOLPES, ESCALON,
} from "../src/play/manada.js";
import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso, suelo } from "../src/red/liso.js";
import { World, perfilMsr, initPhysics } from "../src/play/player.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { ClienteDeRed } from "../src/red/cliente.js";
import { MENSAJE, abrir, RED } from "../src/red/protocolo.js";
import { RELACION } from "../src/bsp/razas.js";
import { ESTADO } from "../src/juego/sesion.js";

// ── el censo de mentira, que es de verdad en lo que importa ─────────────────
//
// Los números son los del goblin de Gate City: `walk` avanza 72,15 unidades en
// 2 s, `run` avanza 76,59 en 0,83 s, y los tres alcances son 90/130/130. Lo
// único inventado son las posiciones, porque no hay mapa.

const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 1, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72.1528, 0, 0] },
  { indice: 2, nombre: "run", fps: 30, fotogramas: 25, bucle: true, actividad: 4, pesoActividad: 1, avance: [76.5887, 0, 0] },
  { indice: 4, nombre: "swing", fps: 30, fotogramas: 30, bucle: false, actividad: 0, pesoActividad: 0, avance: [0, 0, 0] },
  { indice: 6, nombre: "die", fps: 30, fotogramas: 40, bucle: false, actividad: 36, pesoActividad: 1, avance: [0, 0, 0] },
];

const IA_GOBLIN = {
  raza: "goblin", vida: 50, pasea: true, ancho: 32, alto: 60,
  andando: "walk", corriendo: "run", golpe: "swing", muerte: "die",
  alcanceDeGolpe: 130, alcanceDeImpacto: 130, alcanceParaPararse: 90,
  cercaniaDeDestino: 35.2,
  aciertos: { min: 100, max: 100 }, dano: { min: 6, max: 9 },
  experiencia: 26, parry: 0,
};

function censo({ cuantos = 1, pasea = true, hostil = true, separacion = 6 } = {}) {
  const colocados = [];
  for (let n = 0; n < cuantos; n++) {
    colocados.push({
      clase: "msmonster_orcwarrior", script: "monsters/goblin", clave: "goblin",
      nombre: `Goblin ${n + 1}`, hp: 50, ancho: 32, alto: 60,
      parado: null, andando: "walk", piel: 0,
      escena: [n * separacion, 0, 0], yaw: 0, luz: [16, 16, 11],
      hostil, relacion: hostil ? RELACION.ODIO : RELACION.ALIADO,
      ia: { ...IA_GOBLIN, pasea },
    });
  }
  return {
    mapa: "liso", unidadesPorMetro: 39.37,
    razas: [["goblin", { odia: ["human"] }], ["human", {}]],
    modelos: [{ clave: "goblin", carpeta: "bichos/goblin" }],
    colocados,
  };
}

const hacerManada = (opciones = {}, mas = {}) => new Manada(censo(opciones), {
  secuenciasPorClave: new Map([["goblin", SECUENCIAS]]),
  cajasPorClave: new Map([["goblin", { min: [-16, -16, 0], max: [16, 16, 72] }]]),
  ...mas,
});

/** Un dado fijo: la misma semilla da la misma manada, que es medio experimento. */
function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── 1. la manada, sin Three ────────────────────────────────────────────────

test("la manada: el estado que antes vivía dentro de un nodo de Three", async (t) => {
  await t.test("la posición es un array de metros y el rumbo un número", () => {
    const m = hacerManada();
    const i = m.instancias[0];
    assert.deepEqual(i.donde, [0, 0, 0]);
    assert.equal(i.yaw, 0);
    assert.equal(i.nodo, undefined, "la manada no conoce Three");
  });

  await t.test("la velocidad sale del `linearmovement` del archivo, no de un gusto", () => {
    // 72,1528 unidades en 60/30 = 2 s, entre 39,37 u/m = 0,916 m/s. Es el número
    // del goblin de Gate City y lo escribió el compilador del modelo.
    assert.equal(Math.round(velocidadDeSecuencia(SECUENCIAS, "walk") * 1000), 916);
    // Y correr es OTRA secuencia: 76,59 en 25/30 = 0,833 s → 2,33 m/s.
    assert.equal(Math.round(velocidadDeSecuencia(SECUENCIAS, "run") * 100), 233);
    const i = hacerManada().instancias[0];
    assert.equal(Math.round(i.velocidad * 1000), 916);
    assert.equal(Math.round(i.velocidadCorriendo * 100), 233);
  });

  await t.test("una secuencia se busca por nombre Y por índice", () => {
    assert.equal(buscarSecuencia(SECUENCIAS, "run").indice, 2);
    // Por índice porque un arma nombra las suyas por número (`ANIM_ATTACK1 2`).
    assert.equal(buscarSecuencia(SECUENCIAS, "2").nombre, "run");
    // Y sin nada, la primera: es lo que hacía el mapa de clips del renderizador.
    assert.equal(buscarSecuencia(SECUENCIAS, null).nombre, "idle1");
  });

  await t.test("la duración es n/fps y no (n−1)/fps", () => {
    // Cortando en (n−1)/fps la animación se queda quieta un fotograma por
    // vuelta, que se ve como una cojera.
    assert.equal(duracionDe(SECUENCIAS[1]), 2);
    assert.equal(Math.round(duracionDe(SECUENCIAS[0]) * 100), 200);
  });

  await t.test("pedir la que ya está puesta NO rebobina si es de bucle", () => {
    const m = hacerManada();
    const i = m.instancias[0];
    m.pon(i, "walk");
    const gen = i.anim.gen;
    const reinicios = i.sigue.reinicios;
    m.pon(i, "walk");
    m.pon(i, "walk");
    assert.equal(i.anim.gen, gen, "una secuencia de bucle repetida no rebobina");
    assert.equal(i.sigue.reinicios, reinicios);
    assert.equal(i.sigue.veces, 2, "y se cuentan las veces que se dejó correr");
  });

  await t.test("pero una que NO es de bucle rebobina siempre", () => {
    // `if (pev->sequence != iSequence || !m_fSequenceLoops) pev->frame = 0;`
    // — monsters.cpp:1238. Dos hachazos seguidos son dos hachazos.
    //
    // ── CORRECCIÓN DEL 80: «seguidos» no es «en el mismo instante» ──────────
    //
    // Esta prueba pedía los dos hachazos SIN que pasara tiempo entre ellos, y
    // eso en el motor no ocurre: `SetAnimation` le pregunta primero a
    // `CAnimOnce::CanChangeTo`, que devuelve `m_fSequenceFinished`
    // (monsteranimation.cpp:217-220, msmonsterserver.cpp:2023), así que el
    // segundo hachazo en el mismo fotograma **se rechaza**. La regla que esta
    // prueba defiende es la de después —cuando el cambio sí se acepta, una que
    // no es de bucle rebobina— y para verla hay que dejar acabar la primera.
    // El propio `HACK_ATTACK_DELAY 1.0` dice que entre dos golpes pasa un
    // segundo. La cita se queda; lo que estaba mal era el montaje.
    const m = hacerManada();
    const i = m.instancias[0];
    m.pon(i, "swing");
    assert.equal(i.anim.unaVez, true);
    // Se deja acabar: `swing` son 30 fotogramas a 30 fps.
    m.relojes(duracionDe(buscarSecuencia(i.secuencias, "swing")) + 1 / 60);
    const gen = i.anim.gen;
    m.pon(i, "swing");
    assert.equal(i.anim.gen, gen + 1, "el segundo hachazo rebobina");
    assert.equal(i.anim.unaVez, true);
  });

  await t.test("y EN EL MISMO FOTOGRAMA no: `CAnimOnce` no suelta el sitio (80)", () => {
    // El complemento de la de arriba, y el fallo que el 80 vino a arreglar.
    // Thothie lo dejó escrito encima de la guarda: «if you 'dance' around an
    // affected monster, he can never attack, as his swing anims break».
    const m = hacerManada();
    const i = m.instancias[0];
    m.pon(i, "swing");
    const gen = i.anim.gen;
    // Ni el mismo golpe, ni la de correr: mientras el hachazo corre, nada entra.
    assert.equal(m.pon(i, "swing"), null);
    assert.equal(m.pon(i, "run"), null);
    assert.equal(i.anim.gen, gen, "la animación no se ha movido");
    assert.equal(i.sigue.rechazos, 2);
    // Pero `playanim critical` SÍ: rompe antes de poner (npcscript.cpp:1545-1548).
    assert.equal(m.deUnaVez(i, "die"), true);
    assert.equal(i.anim.nombre, "die");
  });

  await t.test("sin ACT_IDLE nombrada se sortea la actividad, no se pone la de andar", () => {
    // Era el fallo del 21: 33 de los 69 no nombran la de estar quietos y se les
    // ponía la de ANDAR, o sea el pueblo entero plantado en mitad de una zancada.
    const i = hacerManada().instancias[0];
    assert.equal(i.ficha.parado, null);
    assert.equal(i.nombreActual, "idle1", "la única con ACT_IDLE");
  });

  await t.test("el cadáver dura 20 s y se desvanece en 3,64", () => {
    const m = hacerManada();
    const i = m.instancias[0];
    m.matar(i);
    assert.equal(i.muerto, true);
    assert.equal(i.nombreActual, "die");
    assert.equal(i.anim.unaVez, true, "una muerte en bucle es un bicho que se cae para siempre");
    m.relojes(19);
    assert.equal(i.opacidad, 1, "a los 19 s todavía se ve entero");
    m.relojes(1.1);
    assert.ok(i.opacidad < 1 && i.opacidad > 0.9, `se empieza a ir: ${i.opacidad}`);
    m.relojes(CADAVER.desvanece);
    assert.equal(i.opacidad, 0);
    assert.equal(Math.round(CADAVER.desvanece * 100) / 100, 3.64);
  });

  await t.test("un muerto no pasea y un cadáver no se levanta", () => {
    const m = hacerManada({ cuantos: 2 });
    const [a, b] = m.instancias;
    m.matar(a);
    const antes = [...a.donde];
    for (let k = 0; k < 600; k++) m.cazar(1 / 60, arnesLlano());
    assert.deepEqual(a.donde, antes, "el muerto sigue donde cayó");
    assert.ok(dist(b.donde, [6, 0, 0]) > 0.5, "y el vivo sí se ha movido");
  });

  await t.test("EL DADO ES UNO: la misma semilla da la misma manada", () => {
    // Esto es el experimento entero dicho en una prueba. Hasta el 27 cada
    // navegador sorteaba con su propio `Math.random`, así que dos jugadores en la
    // misma plaza veían dos pueblos: el goblin que a ti te persigue, al otro le
    // pasea. Con el dado inyectado y una sola manada, no.
    const a = hacerManada({ cuantos: 4 }, { azar: dado(7) });
    const b = hacerManada({ cuantos: 4 }, { azar: dado(7) });
    for (let k = 0; k < 900; k++) { a.cazar(1 / 60, arnesLlano()); b.cazar(1 / 60, arnesLlano()); }
    assert.deepEqual(a.estado(), b.estado());
    // Y el control negativo: con otra semilla, no.
    const c = hacerManada({ cuantos: 4 }, { azar: dado(99) });
    for (let k = 0; k < 900; k++) c.cazar(1 / 60, arnesLlano());
    assert.notDeepEqual(a.estado(), c.estado(), "si dos semillas dieran lo mismo, el dado no se usaría");
  });

  await t.test("`roam 1` anda y sin él se queda quieto", () => {
    const anda = hacerManada({ pasea: true }, { azar: dado(3) });
    const quieto = hacerManada({ pasea: false }, { azar: dado(3) });
    for (let k = 0; k < 900; k++) { anda.cazar(1 / 60, arnesLlano()); quieto.cazar(1 / 60, arnesLlano()); }
    assert.ok(dist(anda.instancias[0].donde, [0, 0, 0]) > 1, "con roam, anda");
    assert.deepEqual(quieto.instancias[0].donde, [0, 0, 0], "sin roam, clavado a propósito");
  });

  await t.test("las constantes del motor siguen donde estaban", () => {
    assert.equal(ESPERA_ENTRE_GOLPES, 1.0);   // HACK_ATTACK_DELAY
    assert.equal(ESCALON, 18);                // m_StepSize
  });
});

// ── 2. lo que viaja ────────────────────────────────────────────────────────

test("la foto de un bicho: lo justo, y aplicarla deja la manada igual", async (t) => {
  await t.test("el estado lleva sitio, rumbo y animación, y nada más", () => {
    const m = hacerManada();
    const e = m.estadoDe(m.instancias[0]);
    assert.deepEqual(Object.keys(e).sort(), ["a", "g", "id", "p", "v", "y"]);
    assert.equal(e.v, 50);
    assert.equal(e.m, undefined, "un vivo no gasta bytes en decir que no está muerto");
  });

  await t.test("un muerto añade la muerte y lo que se ve de él", () => {
    const m = hacerManada();
    m.matar(m.instancias[0]);
    m.relojes(22);
    const e = m.estadoDe(m.instancias[0]);
    assert.equal(e.m, 1);
    assert.ok(e.o < 1 && e.o >= 0);
  });

  await t.test("aplicar la foto de una manada en otra las iguala", () => {
    const a = hacerManada({ cuantos: 3 }, { azar: dado(11) });
    const b = hacerManada({ cuantos: 3 }, { azar: dado(4242) });
    for (let k = 0; k < 600; k++) a.cazar(1 / 60, arnesLlano());
    assert.notDeepEqual(a.estado(), b.estado());
    b.aplicar(a.estado());
    assert.deepEqual(b.estado(), a.estado());
  });

  await t.test("la animación se aplica por generación, no por nombre", () => {
    // Dos hachazos seguidos con la misma secuencia son dos hachazos. Comparando
    // nombres, el segundo no rebobinaría y el bicho daría un golpe de cada dos.
    //
    // CORRECCIÓN DEL 80: los dos golpes van separados por lo que dura el
    // primero, porque `CAnimOnce` no deja empezar el segundo antes (ver «pero
    // una que NO es de bucle rebobina siempre», arriba). Lo que esta prueba
    // defiende —que el delta viaja por `gen` y no por nombre— no cambia: lo que
    // cambia es que antes el segundo `pon` no llegaba a pasar nada.
    const a = hacerManada();
    const b = hacerManada();
    a.pon(a.instancias[0], "swing");
    b.aplicar(a.estado());
    const reinicios = b.instancias[0].sigue.reinicios;
    a.relojes(duracionDe(buscarSecuencia(a.instancias[0].secuencias, "swing")) + 1 / 60);
    a.pon(a.instancias[0], "swing");
    b.aplicar(a.estado());
    assert.equal(b.instancias[0].sigue.reinicios, reinicios + 1, "el segundo golpe también llega");
    assert.equal(b.instancias[0].anim.gen, a.instancias[0].anim.gen);
  });

  await t.test("rebobinar: dónde estaba el bicho hace medio segundo", () => {
    const m = hacerManada({ cuantos: 1 }, { azar: dado(5) });
    const i = m.instancias[0];
    // Se le mueve a mano en línea recta y se apunta el rastro a 100 pasos/s.
    for (let k = 0; k < 64; k++) {
      i.donde[0] = k * 0.1;
      m.t = k * 0.01;
      m.apuntarRastro(m.t);
    }
    assert.equal(m.donde(0, 0.63)[0].toFixed(1), "6.3");
    // Entre dos muestras se interpola: 0,625 s cae justo en medio de las dos
    // últimas. (0,635 no: eso es MÁS NUEVO que la última muestra, y ahí lo
    // correcto es quedarse en ella — se me fue en el primer intento.)
    assert.equal(m.donde(0, 0.625)[0].toFixed(2), "6.25");
    // Y antes de la historia que se guarda, la más vieja — que es lo que hace
    // el motor cuando la latencia se pasa de `sv_maxunlag`.
    assert.equal(m.donde(0, -99)[0], 0);
    assert.equal(m.donde(0, 99)[0].toFixed(1), "6.3");
  });
});

// ── 3. la fauna con física de verdad ───────────────────────────────────────

test("la fauna del servidor: el arnés que le faltaba a la manada", async (t) => {
  // UN MUNDO POR CONTROL, y no uno compartido. Compartiéndolo, cada `new Fauna`
  // deja sus cilindros en el mundo para siempre y al cuarto control hay veinte
  // goblins invisibles apilados en el origen tapándose la vista unos a otros. El
  // síntoma era «el monstruo no persigue», que es el mismo síntoma de media
  // docena de fallos de verdad. Escrito aquí porque es el mismo error que
  // `soltarCuerpo` vino a arreglar en el 27 con los jugadores.
  await t.test("los cilindros se ponen y siguen a los bichos", async () => {
    const mundo = await mundoLiso();
    const f = new Fauna({ ...fichas(censo({ cuantos: 3 })), mundo });
    assert.equal(f.solidos.n, 3);
    const i = f.manada.instancias[0];
    i.donde[0] = 12;
    f.solidos.seguir();
    // La posición del cilindro sale de `donde` y no de un nodo de Three: es lo
    // que hace que `src/play/solidos.js` sirva igual en el servidor.
    assert.equal(f.solidos.puestos[0].cuerpo.nextTranslation().x, 12);
  });

  await t.test("EL CONTROL POSITIVO DEL CERO: sin actualizar el árbol no hay suelo", async () => {
    // Éste es el fallo que costó la tarde, y merece quedarse escrito como
    // prueba. Rapier no contesta a un rayo contra un colisionador recién creado
    // hasta que alguien actualiza su árbol, y quien lo hace es `world.step()`.
    // En el navegador eso pasaba solo —un paso de física por fotograma, y
    // `main.js` da uno más al montar el mundo—, así que la pregunta «¿hay suelo
    // debajo?» funcionaba sin que nadie lo pensara.
    //
    // En el servidor no: el único que llamaba a `step()` era `Player.step`, o
    // sea que con la partida vacía la física NUNCA se actualizaba. `suelo()`
    // devolvía null para los 69, o sea «no hay suelo delante», o sea los 69
    // quietos con `roam 1` puesto. Diez segundos de servidor, 0,00 m recorridos,
    // ni una excepción.
    const RAPIER = await initPhysics();
    const crudo = new World(suelo(200), { perfil: perfilMsr(39.37) });
    const rayo = () => crudo.world.castRay(
      new RAPIER.Ray({ x: 50, y: 1.5, z: 0 }, { x: 0, y: -1, z: 0 }), 3, true);
    assert.equal(rayo(), null, "recién creado, el suelo no existe para un rayo");
    crudo.world.propagateModifiedBodyPositionsToColliders();
    crudo.world.updateSceneQueries();
    assert.notEqual(rayo(), null, "y con el árbol al día, sí");
    // La fauna lo hace en el constructor y en cada paso, así que la pregunta se
    // contesta siempre — también con la partida vacía.
    const mundo = await mundoLiso();
    const f = new Fauna({ ...fichas(censo({ cuantos: 1 })), mundo });
    assert.equal(Math.round(f.arnes.suelo(50, 0.5, 0, null) * 1000), 0);
  });

  await t.test("los bichos ANDAN en el servidor, y se mide", async () => {
    const mundo = await mundoLiso();
    const f = new Fauna({ ...fichas(censo({ cuantos: 5, separacion: 10 })), mundo, azar: dado(21) });
    const antes = f.manada.instancias.map((i) => [...i.donde]);
    // Diez segundos al paso del servidor: `sys_ticrate` 100.
    for (let k = 0; k < 1000; k++) f.paso(1 / 100);
    const movidos = f.manada.instancias.filter((i, n) => dist(i.donde, antes[n]) > 0.5).length;
    assert.ok(movidos >= 4, `se han movido ${movidos} de 5`);
    // Y el suelo los sostiene: nadie se ha caído del mundo.
    for (const i of f.manada.instancias) assert.ok(Math.abs(i.donde[1]) < 0.01, `y=${i.donde[1]}`);
    // El rastro se ha ido llenando, y es lo que permite rebobinar.
    assert.equal(f.manada.instancias[0].rastro.length, RED.historia);
  });

  await t.test("los objetivos son TODOS los jugadores, que es la mudanza entera", async () => {
    const mundo = await mundoLiso();
    const f = new Fauna({ ...fichas(censo({ cuantos: 1 })), mundo });
    // Sin nadie dentro no hay a quién perseguir, y eso no es un fallo.
    assert.deepEqual(f.arnes.objetivos(f.manada.instancias[0]), []);
    const a = mundo.crearCuerpo([3, 0, 0]);
    const b = mundo.crearCuerpo([9, 0, 0]);
    f.jugadores = () => [{ id: 1, cuerpo: a, vivo: true }, { id: 2, cuerpo: b, vivo: true }];
    const o = f.arnes.objetivos(f.manada.instancias[0]);
    assert.equal(o.length, 2, "dos jugadores, dos objetivos");
    assert.deepEqual(o.map((x) => x.id), ["j1", "j2"]);
    assert.ok(o.every((x) => x.esJugador));
    // La relación es la del bicho, horneada contra `human`.
    assert.equal(o[0].relacion, RELACION.ODIO);
    mundo.soltarCuerpo(a);
    mundo.soltarCuerpo(b);
  });

  await t.test("persigue al jugador que ve, y le acaba pegando", async () => {
    const mundo = await mundoLiso();
    const f = new Fauna({ ...fichas(censo({ cuantos: 1 })), mundo, azar: dado(2) });
    const yo = mundo.crearCuerpo([8, 0, 0]);
    f.jugadores = () => [{ id: 1, cuerpo: yo, vivo: true }];
    const golpes = [];
    f.golpear = (i, j, dano) => { golpes.push({ de: i.id, a: j.id, dano }); return null; };
    const antes = dist(f.manada.instancias[0].donde, yo.feet);
    for (let k = 0; k < 800; k++) f.paso(1 / 100);
    const ahora = dist(f.manada.instancias[0].donde, yo.feet);
    assert.ok(ahora < antes - 3, `se ha acercado de ${antes.toFixed(1)} a ${ahora.toFixed(1)} m`);
    assert.ok(golpes.length >= 1, `le ha pegado ${golpes.length} veces`);
    // `ATTACK_DAMAGE $randf(6,9)`: el daño está en su rango y no es un número fijo.
    for (const g of golpes) assert.ok(g.dano >= 6 && g.dano <= 9, `daño ${g.dano}`);
    // Y no más de uno por segundo: `HACK_ATTACK_DELAY 1.0`.
    assert.ok(golpes.length <= 9, `${golpes.length} golpes en 8 s, con 1 s de espera`);
    mundo.soltarCuerpo(yo);
  });

  await t.test("un golpe a un bicho: se recorta con la distancia del PASADO", async () => {
    const mundo = await mundoLiso();
    const f = new Fauna({ ...fichas(censo({ cuantos: 1 })), mundo });
    const i = f.manada.instancias[0];
    // De cerca vale.
    assert.equal(f.pegar({ id: 0, dano: 10, alcance: 130, desde: [0.5, 0, 0] }).vale, true);
    assert.equal(i.vida, 40);
    // De lejos no, y se dice por qué.
    const lejos = f.pegar({ id: 0, dano: 10, alcance: 130, desde: [40, 0, 0] });
    assert.equal(lejos.vale, false);
    assert.equal(lejos.lejos, true);
    assert.equal(i.vida, 40, "y no le ha quitado nada");
    // Y a uno que no existe, tampoco.
    assert.equal(f.pegar({ id: 999, dano: 10 }).vale, false);
  });

  await t.test("al morir se le quita el cilindro, que si no es un muro invisible", async () => {
    const mundo = await mundoLiso();
    const f = new Fauna({ ...fichas(censo({ cuantos: 2 })), mundo });
    assert.equal(f.solidos.n, 2);
    const r = f.pegar({ id: 0, dano: 999 });
    assert.equal(r.muerto, true);
    assert.equal(f.solidos.puestos.length, 1, "`pev->solid = SOLID_NOT` (combat.cpp:642)");
    assert.equal(f.resumen.vivos, 1);
  });
});

// ── 4. la partida entera ───────────────────────────────────────────────────

test("la partida con fauna: el golpe se pide y la vida la lleva el servidor", async (t) => {
  await t.test("la foto lleva los bichos, y el delta no repite a los clavados", async () => {
    // `hostil: false` a propósito: con un jugador dentro, un hostil PERSIGUE, y
    // entonces cambia en cada foto y el delta no ahorra nada. Lo escribí con
    // goblins hostiles y el control decía «3 !== 0» — y tenía razón: los tres
    // venían a por mí. Los clavados de Gate City son los 16 tenderos y el
    // alcalde, y ésos son justo los que no son hostiles.
    const { partida, cliente } = await montar({ cuantos: 3, pasea: false, hostil: false });
    await entrar(partida, cliente);
    const primera = partida.foto(cliente);
    assert.equal(primera.bichos.length, 3, "la primera va completa");
    // Se acusa y se pide otra: los tres están clavados (`roam 0`), así que no
    // cambia ninguno y el delta va vacío.
    cliente.fotoReconocida = primera.seq;
    partida.avanzar(0.2);
    const segunda = partida.foto(cliente);
    assert.equal(segunda.bichos.length, 0, "nadie ha cambiado: no viaja ninguno");
    // Y si uno cambia, viaja ése y sólo ése.
    partida.fauna.manada.pon(partida.fauna.manada.de(1), "swing");
    cliente.fotoReconocida = segunda.seq;
    // Un paso, porque la foto de la manada se calcula UNA VEZ POR PASO y se
    // comparte: dos clientes que reciben en la misma vuelta usan la misma, que es
    // lo que hace que la cola de 64 no dependa de cuántos jugadores haya.
    partida.avanzar(0.01);
    const tercera = partida.foto(cliente);
    assert.equal(tercera.bichos.length, 1);
    assert.equal(tercera.bichos[0].id, 1);
  });

  await t.test("los que pasean sí viajan, y el reparto no depende de cuántos jueguen", async () => {
    const { partida, cliente } = await montar({ cuantos: 4, pasea: true });
    await entrar(partida, cliente);
    partida.foto(cliente);
    partida.avanzar(2);
    cliente.fotoReconocida = cliente.fotoSeq;
    const f = partida.foto(cliente);
    assert.ok(f.bichos.length >= 1, `han cambiado ${f.bichos.length} de 4`);
    // La cola de fotos de la manada es una sola para todos: 64 y no 64 por
    // jugador, que es lo que la hace barata con treinta y dos.
    assert.ok(partida._fotosDeBichos.size <= RED.historia);
  });

  await t.test("EL TECHO DEL DAÑO: el cliente puede mandar 9 999 y no sirve", async () => {
    const { partida, cliente } = await montar({ cuantos: 1, pasea: false, catalogo: CATALOGO });
    await entrar(partida, cliente, { arma: "weapon_shortsword" });
    const i = partida.fauna.manada.de(0);
    const antes = i.vida;
    await partida.recibir(cliente.id, { t: MENSAJE.PEGAR, id: 0, dano: 9999, alcance: 100000 });
    const quitado = antes - i.vida;
    assert.ok(quitado > 0, "el golpe entra");
    assert.ok(quitado < 9999, `y se recorta: ha quitado ${quitado.toFixed(1)}`);
    // El techo es el del arma: base × carga + rango, por el crítico.
    const techo = partida._techoDeDano(cliente);
    assert.ok(Number.isFinite(techo), `el techo existe: ${techo}`);
    assert.equal(Math.round(quitado * 100), Math.round(techo * 100));
  });

  await t.test("un golpe desde el otro lado del mapa no cuela", async () => {
    // Y el punto de salida no lo manda el cliente: lo pone el servidor con los
    // pies que él tiene. Si viniera de fuera, pegar de lejos sería mandar otras
    // coordenadas.
    const { partida, cliente } = await montar({ cuantos: 1, pasea: false, lejos: true });
    await entrar(partida, cliente);
    const i = partida.fauna.manada.de(0);
    const antes = i.vida;
    await partida.recibir(cliente.id, { t: MENSAJE.PEGAR, id: 0, dano: 5, alcance: 130 });
    assert.equal(i.vida, antes, "el bicho está a 60 m y la espada llega a 130 unidades");
    const s = cliente.sucesosPendientes.find((x) => x.que === "tupegas");
    assert.equal(s.lejos, true);
  });

  await t.test("matar reparte experiencia, y la apunta el personaje del SERVIDOR", async () => {
    const { partida, cliente } = await montar({ cuantos: 1, pasea: false, catalogo: CATALOGO });
    await entrar(partida, cliente, { arma: "weapon_shortsword" });
    const p = cliente.sesion.personaje;
    const antes = JSON.stringify(p.habilidades);
    // Se le pega hasta matarlo. El cubo lo dice el cliente (qué habilidad ha
    // usado) y la cantidad la decide el servidor al morir.
    for (let k = 0; k < 40 && !partida.fauna.manada.de(0).muerto; k++) {
      await partida.recibir(cliente.id, { t: MENSAJE.PEGAR, id: 0, dano: 9999, alcance: 100000, cubo: "swordsmanship.power" });
    }
    assert.equal(partida.fauna.manada.de(0).muerto, true);
    const s = cliente.sucesosPendientes.filter((x) => x.que === "tupegas").pop();
    assert.equal(s.muerto, true);
    assert.ok(s.experiencia.total > 0, `experiencia: ${JSON.stringify(s.experiencia)}`);
    assert.notEqual(JSON.stringify(p.habilidades), antes, "y se ha apuntado en el personaje de allí");
  });

  await t.test("un bicho que pega baja la vida de la sesión del servidor", async () => {
    const { partida, cliente } = await montar({ cuantos: 1, pasea: false });
    await entrar(partida, cliente);
    const p = cliente.sesion.personaje;
    const antes = p.vida;
    const i = partida.fauna.manada.de(0);
    partida._bichoPega(i, cliente, 7);
    assert.equal(p.vida, antes - 7);
    // Y viaja en la foto, que es por donde el navegador se enterará.
    const f = partida.foto(cliente);
    assert.equal(f.jugadores[0].vida, antes - 7);
    assert.equal(f.jugadores[0].id, cliente.id);
  });

  await t.test("y el navegador copia la vida, no la resta otra vez", async () => {
    // Restarla en los dos lados no daría error: daría un personaje que muere el
    // doble de rápido que el que el servidor guarda.
    const c = new ClienteDeRed({ enlace: { enviar() {}, al: () => () => {} } });
    c.yo = 1;
    c.dentro = true;
    c._foto({ seq: 1, tiempo: 1, ack: 0, jugadores: [{ id: 1, pies: [0, 0, 0], yaw: 0, vida: 40, estado: ESTADO.JUGANDO }] });
    assert.equal(c.vida, 40);
    const avisos = [];
    c.al("vitales", (v) => avisos.push(v));
    c._foto({ seq: 2, tiempo: 2, ack: 0, jugadores: [{ id: 1, pies: [0, 0, 0], yaw: 0, vida: 33, estado: ESTADO.JUGANDO }] });
    assert.equal(c.vida, 33);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].antes.vida, 40);
    // La primera foto NO avisa: enterarse de lo que hay no es un cambio, y sin
    // esta guarda entrar al mapa dispararía un «te han hecho daño» de la vida
    // entera.
    assert.equal(avisos[0].vida, 33);
  });

  await t.test("los sucesos se vacían al mandarlos: un golpe suena una vez", async () => {
    const { partida, cliente } = await montar({ cuantos: 1, pasea: false });
    await entrar(partida, cliente);
    await partida.recibir(cliente.id, { t: MENSAJE.PEGAR, id: 0, dano: 3, alcance: 100000 });
    const a = partida.foto(cliente);
    assert.ok(a.sucesos.length >= 1);
    const b = partida.foto(cliente);
    assert.equal(b.sucesos, undefined, "no se repiten hasta el final de la partida");
  });

  await t.test("el cliente interpola los bichos con la MISMA cola que los jugadores", () => {
    const c = new ClienteDeRed({ enlace: { enviar() {}, al: () => () => {} }, ahora: () => c._t });
    c.yo = 1;
    c.dentro = true;
    c._t = 0;
    // Tres fotos a 50 ms: con `ex_interp` de 100 ms hacen falta tres para poder
    // interpolar, y eso ya se aprendió en el 27.
    for (const [k, x] of [[0, 0], [1, 1], [2, 2]]) {
      c._t = 0.05 * k;
      c._foto({ seq: k + 1, tiempo: 0.05 * k, ack: 0, jugadores: [], bichos: [{ id: 0, p: [x, 0, 0], y: 0, a: "walk", g: 1 }] });
    }
    // Ahora: t del servidor 0,1 + 0 de reloj local − 0,1 de ventana = 0,0.
    c._t = 0.1;
    assert.equal(c.bichosInterpolados()[0].p[0], 0);
    // 40 ms después se pide el instante 0,04: el 80 % del camino entre 0 y 1.
    c._t = 0.14;
    assert.equal(c.bichosInterpolados()[0].p[0].toFixed(2), "0.80");
    // Y si no llega la siguiente, NO se extrapola: se queda en la última.
    c._t = 5;
    assert.equal(c.bichosInterpolados()[0].p[0], 2, "extrapolar es adivinar");
  });

  await t.test("sin fauna la partida sigue siendo una partida", async () => {
    // La de las pruebas del 27: un suelo liso y dos jugadores, sin 69 monstruos
    // de ruido. Tiene que seguir siendo posible.
    const mundo = await mundoLiso();
    const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), ahora: () => 0 });
    const cliente = partida.conectar(sordo());
    await entrar(partida, cliente);
    const f = partida.foto(cliente);
    assert.equal(f.bichos, undefined);
    assert.equal(partida.resumen.bichos, undefined);
  });
});

// ── el andamio ─────────────────────────────────────────────────────────────

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * El catálogo, con una espada. Hace falta para el techo del daño: sin catálogo
 * el servidor no sabe qué lleva en la mano y NO recorta — que es lo que ya hace
 * `tools/servidor.mjs`, avisando por consola de lo que le falta.
 */
const CATALOGO = {
  objetos: [{
    id: "weapon_shortsword", nombre: "Short Sword", peso: 40,
    multiplicadorDeCarga: 2,
    ataques: [{ nombre: "swing", dano: 9, danoRango: 5, alcance: 60, carga: 1, habilidad: "swordsmanship", tipoDano: "slash" }],
  }],
};

/** Un arnés sin mundo: suelo plano en y=0 y nada delante. Para la manada sola. */
const arnesLlano = () => ({ libre: () => true, suelo: () => 0, objetivos: () => [] });

const fichas = (c) => ({
  censo: c,
  secuenciasPorClave: new Map([["goblin", SECUENCIAS]]),
  cajasPorClave: new Map([["goblin", { min: [-16, -16, 0], max: [16, 16, 72] }]]),
});

/** Un enlace que se traga todo: la partida se prueba sin abrir un puerto. */
function sordo() {
  const dichos = [];
  return { dichos, enviar(t) { dichos.push(abrir(t)); }, al: () => () => {} };
}

async function montar({ cuantos = 1, pasea = false, lejos = false, hostil = true, catalogo = null } = {}) {
  const mundo = await mundoLiso();
  const c = censo({ cuantos, pasea, hostil });
  // «Lejos» es el bicho a 60 m del punto de aparición, que es lo que hace falta
  // para comprobar que un golpe de lejos no cuela.
  if (lejos) for (const x of c.colocados) x.escena = [60, 0, 0];
  const fauna = new Fauna({ ...fichas(c), mundo, azar: dado(13) });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0, catalogo,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0, 0] } },
  });
  const cliente = partida.conectar(sordo());
  return { partida, cliente, fauna, mundo };
}

async function entrar(partida, cliente, { arma = null } = {}) {
  await cliente.sesion.arrancar();
  const p = await cliente.sesion.crear({ nombre: "Ana", genero: "female", ...(arma ? { arma } : {}) });
  await partida.recibir(cliente.id, { t: MENSAJE.ELEGIR, id: p.id });
  return p;
}
