// REAPARECER DENTRO DE LA ROCA — experimento 99 (doc/REAPARECER_99.md).
//
// Tres cosas, y la que importa es la segunda:
//
//   1. `PM_CheckStuck` y su tabla (src/play/atasco.js), con un probador de
//      mentira: la REGLA, sin Rapier.
//   2. **el servidor no se cuelga**: un cuerpo metido en una malla densa recibe
//      trescientas órdenes y Rapier no calcula ni un movimiento. Hasta el 99
//      cada una costaba decenas de milisegundos con esta malla y SEGUNDOS con
//      la de Gate City. La prueba cuenta las llamadas al controlador, que es lo
//      que no depende de lo cargada que esté la máquina, y lleva un `timeout`
//      para que, si algún día vuelve, `npm test` se ponga rojo en vez de
//      quedarse esperando.
//   3. al reaparecer el cuerpo va al punto (`MoveToSpawnSpot`), y el sitio que
//      se elige cabe y no está al otro lado de una pared.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { Atasco, TABLA, ENTRE_PRUEBAS, FORCEJEO, probadorDe } from "../src/play/atasco.js";
import { World, Player, perfilMsr, initPhysics } from "../src/play/player.js";
import { Partida, puntoDeAparicion, TOPE_MS_POR_MENSAJE } from "../src/red/partida.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, orden } from "../src/red/protocolo.js";
import { ESTADO, ESPERA_MUERTO } from "../src/juego/sesion.js";

const U = 39.37;

// ── mallas ──────────────────────────────────────────────────────────────────

function rejilla(n, lado, y = 0) {
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) pos.push(-lado / 2 + (lado * i) / n, y, -lado / 2 + (lado * j) / n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return { positions: pos, indices: idx };
}

/** Un rectángulo vertical en el plano x = `x`, de dos caras. */
function pared(x, { alto = 3, ancho = 10 } = {}) {
  const z = ancho / 2;
  return {
    positions: [x, 0, -z, x, alto, -z, x, alto, z, x, 0, z],
    indices: [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2],
  };
}

function juntar(...ms) {
  const P = [], I = [];
  let off = 0;
  for (const m of ms) {
    P.push(...m.positions);
    for (const k of m.indices) I.push(k + off);
    off += m.positions.length / 3;
  }
  return { positions: new Float32Array(P), indices: new Uint32Array(I), triangleCount: I.length / 3 };
}

/**
 * LA ROCA DE CAPAS: cinco láminas de 40×40 celdas en 1,8 m de alto, 48 000
 * triángulos, sobre un suelo grande. Una cápsula metida ahí corta cientos de
 * triángulos a la vez, que es lo que hace caro al controlador de Rapier: medido
 * en el 99, 31 ms por paso de media y 64 de pico. La de Gate City llega a
 * 1 888 ms en un solo paso, pero cargar el mapa no es cosa de `npm test`.
 */
function mallaDeRoca() {
  const capas = [];
  for (let k = 0; k < 5; k++) capas.push(rejilla(40, 4, (k * 1.8) / 5));
  return juntar(rejilla(2, 200, 0), ...capas.map((m) => ({ positions: m.positions.map((v, i) => (i % 3 === 0 ? v + 20 : v)), indices: m.indices })));
}

/** El mundo de una partida, como `mundoLiso` pero con la malla que se le dé. */
async function mundoDe(malla) {
  await initPhysics();
  const perfil = perfilMsr(U);
  const world = new World(malla, { perfil });
  return {
    world, perfil, triangulos: malla.triangleCount,
    crearCuerpo(pies) { return new Player(world, pies, { perfil }); },
    soltarCuerpo(cuerpo) { try { world.world.removeRigidBody(cuerpo.body); } catch { /* ya no estaba */ } },
  };
}

function buzon() {
  const dentro = [];
  return {
    dentro,
    enviar: (texto) => dentro.push(JSON.parse(texto)),
    ultimo: (tipo) => [...dentro].reverse().find((m) => m.t === tipo) ?? null,
    al: () => () => {},
  };
}

async function jugadorDentro(partida, nombre) {
  const b = buzon();
  const c = partida.conectar(b, { nombre });
  await partida.recibir(c.id, { t: MENSAJE.CREAR, personaje: { nombre } });
  const lista = b.ultimo(MENSAJE.LISTA).personajes;
  await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: lista.find((p) => p.nombre === nombre).id });
  return { b, c };
}

/** Cuenta las llamadas a `computeColliderMovement`: el instrumento de la prueba 2. */
function contarMovimientos(mundo) {
  const ctl = mundo.world.controller;
  const original = ctl.computeColliderMovement.bind(ctl);
  const cuenta = { n: 0 };
  ctl.computeColliderMovement = (...a) => { cuenta.n++; return original(...a); };
  return cuenta;
}

// ── 1. la regla ─────────────────────────────────────────────────────────────

test("PM_CheckStuck: la tabla y la regla, sin Rapier", async (t) => {
  await t.test("la tabla: 53 empujones y un cero de relleno, como el `memset` de 54", () => {
    assert.equal(TABLA.length, 54);
    // pm_shared.cpp:3416-3510, a mano: los tres primeros son la z pequeña.
    assert.deepEqual(TABLA.slice(0, 3), [[0, 0, -0.125], [0, 0, 0], [0, 0, 0.125]]);
    // 17 «Little Moves» (3 + 3 + 3 + 8) y luego los grandes: z a 0, 1 y 6.
    assert.deepEqual(TABLA.slice(17, 20), [[0, 0, 0], [0, 0, 1], [0, 0, 6]]);
    // El último del bucle es la esquina (2, 2, 6) y la casilla 54 queda a cero.
    assert.deepEqual(TABLA[52], [2, 2, 6]);
    assert.deepEqual(TABLA[53], [0, 0, 0]);
    // Ningún empujón pasa de 6 unidades: la tabla NO saca a nadie de una pared.
    assert.ok(TABLA.every((v) => v.every((x) => Math.abs(x) <= 6)));
    assert.equal(ENTRE_PRUEBAS, 0.05);
  });

  await t.test("libre: no está atascado y no se toca nada", () => {
    const a = new Atasco();
    const pies = [1, 2, 3];
    const r = a.comprobar({ pies, t: 0, probar: () => null });
    assert.equal(r.atascado, false);
    assert.equal(r.pies, pies);
  });

  await t.test("en el servidor: UNA prueba por cada 0,05 s, y entre medias atascado sin preguntar", () => {
    const a = new Atasco({ servidor: true });
    let preguntas = 0;
    const probar = () => { preguntas++; return { jugador: false }; };
    const r1 = a.comprobar({ pies: [0, 0, 0], t: 1, probar });
    assert.equal(r1.atascado, true);
    assert.equal(preguntas, 2, "la posición y un empujón de la tabla");
    const r2 = a.comprobar({ pies: [0, 0, 0], t: 1.01, probar });
    assert.equal(r2.atascado, true);
    assert.equal(preguntas, 3, "«Too soon?»: sólo la posición, ningún empujón");
    a.comprobar({ pies: [0, 0, 0], t: 1.06, probar });
    assert.equal(preguntas, 5, "pasados 0,05 s vuelve a probar un empujón");
  });

  await t.test("un empujón PEQUEÑO libre no se aplica (`i >= 27`) y el paso sigue dentro", () => {
    const a = new Atasco();
    const base = [0, 0, 0];
    let n = 0;
    // Sólida la base; libre el primer empujón (índice 0).
    const probar = () => (n++ === 0 ? { jugador: false } : null);
    const r = a.comprobar({ pies: base, t: 0, probar });
    assert.equal(r.atascado, false, "el motor devuelve 0");
    assert.equal(r.pies, base, "pero no mueve el origen");
    assert.equal(r.dentro, true, "y `PM_FlyMove` empezará en sólido");
  });

  await t.test("un empujón GRANDE libre sí mueve, en unidades del motor y con su eje", () => {
    const a = new Atasco({ unidadesPorMetro: U });
    a.siguiente = 44;             // TABLA[44] = (-2, -2, 6)
    const r = a.comprobar({ pies: [0, 0, 0], t: 0, probar: (p) => (p[0] === 0 ? { jugador: false } : null) });
    assert.equal(r.atascado, false);
    assert.equal(r.dentro, false);
    // (x, y, z) del motor → (x, z, −y) de la escena, en metros.
    assert.deepEqual(r.pies.map((v) => Math.round(v * U * 1000) / 1000), [-2, 6, 2]);
  });

  await t.test("forcejeo: atascado en OTRO JUGADOR y pulsando saltar, la rejilla le saca hacia arriba", () => {
    const a = new Atasco({ unidadesPorMetro: U });
    const sale = (p) => p[1] * U < 17.5;   // libre a partir de 18 unidades de altura
    const probar = (p) => (sale(p) ? { jugador: true } : null);
    const quieto = a.comprobar({ pies: [0, 0, 0], t: 0, probar });
    assert.equal(quieto.atascado, true, "sin botones no forcejea");
    const r = new Atasco({ unidadesPorMetro: U }).comprobar({ pies: [0, 0, 0], t: 0, botones: FORCEJEO, probar });
    assert.equal(r.atascado, false);
    assert.equal(Math.round(r.pies[1] * U), 18, "un escalón de la rejilla: 18 unidades");
    // Y en la pared no: la rejilla es «stuck in another player», no del mundo.
    const pared = new Atasco({ unidadesPorMetro: U }).comprobar({
      pies: [0, 0, 0], t: 0, botones: FORCEJEO, probar: (p) => (sale(p) ? { jugador: false } : null),
    });
    assert.equal(pared.atascado, true);
  });

  await t.test("en el CLIENTE los 54 intentos son de golpe; en el servidor no", () => {
    let n = 0;
    const probar = () => (++n < 40 ? { jugador: false } : null);
    const r = new Atasco({ servidor: false }).comprobar({ pies: [0, 0, 0], t: 0, probar });
    assert.equal(r.atascado, false, "el intento 39 de la tabla sale");
    n = 0;
    const s = new Atasco({ servidor: true }).comprobar({ pies: [0, 0, 0], t: 0, probar });
    assert.equal(s.atascado, true);
    assert.equal(n, 2, "el servidor pregunta dos veces y no cincuenta y cinco");
  });
});

// ── 2. el servidor no se cuelga ─────────────────────────────────────────────

test("el servidor NO se cuelga con un jugador metido en la roca", { timeout: 60_000 }, async (t) => {
  const mundo = await mundoDe(mallaDeRoca());
  const aparicion = {
    mapa: "roca",
    nacimiento: { nombre: "al lado", escena: [0, 0.05, 0] },
    reaparicion: { nombre: "al lado", escena: [0, 0.05, 0] },
  };
  const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "roca" });
  const { c } = await jugadorDentro(partida, "Roca");
  const probar = probadorDe(c.cuerpo);
  const cuenta = contarMovimientos(mundo);
  let seq = 0;
  const mandar = async (n, extra = {}) => {
    for (let i = 0; i < n; i++) {
      await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: ++seq, msec: 10, adelante: 1, ...extra }] });
      partida.avanzar(0.01);
    }
  };

  await t.test("control positivo: en lo libre, cada orden SÍ mueve la cápsula con Rapier", async () => {
    assert.equal(probar(c.cuerpo.feet), null, "nace en un sitio donde cabe");
    const antes = cuenta.n;
    await mandar(20);
    assert.ok(cuenta.n - antes >= 20, `${cuenta.n - antes} movimientos en 20 órdenes`);
  });

  await t.test("metido en la roca: 300 órdenes y Rapier no calcula NI UN movimiento", async () => {
    c.cuerpo.colocar([20.03, 0.01, 0.02]);
    assert.ok(probar(c.cuerpo.feet), "la cápsula corta la malla: el instrumento ve el atasco");
    const antes = cuenta.n;
    const t0 = performance.now();
    await mandar(300);
    const ms = performance.now() - t0;
    assert.equal(cuenta.n - antes, 0, `${cuenta.n - antes} llamadas a computeColliderMovement estando atascado`);
    assert.ok(c.pasosAtascado >= 300, `${c.pasosAtascado} pasos parados por PM_CheckStuck`);
    // El reloj, como red de seguridad y no como medida: sin el arreglo son
    // nueve segundos con esta malla.
    assert.ok(ms < 5000, `${Math.round(ms)} ms para 300 órdenes`);
  });

  await t.test("y SIGUE atascado: el motor no saca a nadie de una pared, sólo deja de moverle", () => {
    assert.ok(probar(c.cuerpo.feet));
  });

  await t.test("al reaparecer sale: el cuerpo vuelve al punto y vuelve a moverse", async () => {
    c.sesion.matar({ porQue: "prueba", tipo: "trampa" });
    for (let i = 0; i < Math.ceil((ESPERA_MUERTO + 0.2) / 0.01); i++) partida.avanzar(0.01);
    assert.equal(c.sesion.estado, ESTADO.JUGANDO);
    assert.equal(probar(c.cuerpo.feet), null, "donde reaparece, cabe");
    const antes = cuenta.n;
    await mandar(10);
    assert.ok(cuenta.n - antes >= 10);
  });
});

// ── 3. reaparecer y el sitio ────────────────────────────────────────────────

test("reaparecer: MoveToSpawnSpot en el servidor", async (t) => {
  await t.test("el cuerpo va al punto de reaparición, con la velocidad a cero", async () => {
    const mundo = await mundoDe(juntar(rejilla(2, 200, 0)));
    const aparicion = {
      mapa: "liso",
      nacimiento: { nombre: "n", escena: [0, 0, 0] },
      reaparicion: { nombre: "r", escena: [5, 0, -5] },
    };
    const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "p" });
    const { c } = await jugadorDentro(partida, "Muere");
    c.cuerpo.colocar([30, 0.02, 30], { velocidad: [100, 0, 0] });
    c.sesion.matar({ porQue: "prueba", tipo: "trampa" });
    // Control: muerto, el cuerpo sigue donde murió.
    for (let i = 0; i < 100; i++) partida.avanzar(0.01);
    assert.equal(c.sesion.estado, ESTADO.MUERTO);
    assert.ok(Math.hypot(c.cuerpo.feet[0] - 30, c.cuerpo.feet[2] - 30) < 0.01, "el muerto no se mueve de sitio");
    for (let i = 0; i < Math.ceil(ESPERA_MUERTO / 0.01); i++) partida.avanzar(0.01);
    assert.equal(c.sesion.estado, ESTADO.JUGANDO);
    const p = c.cuerpo.feet;
    assert.ok(Math.hypot(p[0] - 5, p[2] + 5) < 0.01, `reaparece en (5, −5) y está en (${p[0].toFixed(2)}, ${p[2].toFixed(2)})`);
    assert.deepEqual(c.cuerpo.vel, [0, 0, 0]);
  });

  await t.test("el punto metido en la pared: aparece al lado, EN EL MISMO LADO, y cabe", async () => {
    // Una pared a 20 cm del punto: la cápsula (radio 0,406 m) la corta.
    const mundo = await mundoDe(juntar(rejilla(2, 200, 0), pared(0.2)));
    const punto = [0, 0, 0];
    const aparicion = { mapa: "pared", nacimiento: { nombre: "n", escena: punto } };
    const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "p" });
    const { c } = await jugadorDentro(partida, "Pared");
    const probar = probadorDe(c.cuerpo);
    assert.ok(probar(puntoDeAparicion(punto)), "control: en el punto tal cual, la cápsula corta la pared");
    assert.equal(probar(c.cuerpo.feet), null, "donde le ha puesto el servidor, cabe");
    assert.ok(c.cuerpo.feet[0] < 0.2, `x = ${c.cuerpo.feet[0].toFixed(2)}: del lado del punto`);
    assert.ok(Math.hypot(c.cuerpo.feet[0], c.cuerpo.feet[2]) < 1, "y cerca");
  });

  await t.test("en un pasillo más estrecho que el jugador NO se le pasa al otro lado de la pared", async () => {
    // Dos paredes a +0,2 y −0,3: no cabe en ningún sitio de este lado, y los
    // sitios donde cabe están detrás de una pared. Lo que se pide es que no
    // elija ésos: se queda en el punto y lo para `PM_CheckStuck`.
    const mundo = await mundoDe(juntar(rejilla(2, 200, 0), pared(0.2), pared(-0.3)));
    const aparicion = { mapa: "pasillo", nacimiento: { nombre: "n", escena: [0, 0, 0] } };
    const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "p" });
    const { c } = await jugadorDentro(partida, "Pasillo");
    const x = c.cuerpo.feet[0];
    assert.ok(x > -0.3 && x < 0.2, `x = ${x.toFixed(2)}: entre las dos paredes`);
  });

  await t.test("dos que entran no nacen uno dentro del otro, y los dos caben", async () => {
    const mundo = await mundoDe(juntar(rejilla(2, 200, 0)));
    const aparicion = { mapa: "liso", nacimiento: { nombre: "n", escena: [0, 0, 0] } };
    const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "p" });
    const a = await jugadorDentro(partida, "Uno");
    const b = await jugadorDentro(partida, "Dos");
    const d = Math.hypot(a.c.cuerpo.feet[0] - b.c.cuerpo.feet[0], a.c.cuerpo.feet[2] - b.c.cuerpo.feet[2]);
    assert.ok(d > 2 * mundo.perfil.radius, `${d.toFixed(2)} m entre los dos`);
    const esJugador = (col) => col.handle === a.c.cuerpo.collider.handle;
    assert.equal(probadorDe(b.c.cuerpo, { esJugador })(b.c.cuerpo.feet), null);
    // Control: en el sitio del primero, el segundo SÍ estaría atascado.
    assert.deepEqual(probadorDe(b.c.cuerpo, { esJugador })(a.c.cuerpo.feet), { jugador: true });
    // Y EL PRIMERO ANDA. El segundo se crea en el punto —encima del primero— y
    // se aparta; si el árbol de Rapier no se pone al día, el primero le sigue
    // viendo encima y `PM_CheckStuck` no le deja moverse nunca (el 99, medido
    // en test/servidor98 antes de arreglarlo).
    const antes = a.c.cuerpo.feet;
    for (let i = 1; i <= 30; i++) {
      await partida.recibir(a.c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: i, msec: 10, adelante: 1 }] });
    }
    assert.equal(a.c.pasosAtascado ?? 0, 0, `${a.c.pasosAtascado} pasos parados`);
    assert.ok(Math.hypot(a.c.cuerpo.feet[0] - antes[0], a.c.cuerpo.feet[2] - antes[2]) > 0.2, "y se ha movido");
  });
});

// ── 3b. un bicho DENTRO del jugador ─────────────────────────────────────────

test("un bicho que se ha metido DENTRO del jugador no cuenta para su paso", async (t) => {
  const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
  const mundo = await mundoDe(juntar(rejilla(2, 200, 0)));
  const aparicion = { mapa: "liso", nacimiento: { nombre: "n", escena: [0, 0, 0] } };
  const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "p" });
  const { c } = await jugadorDentro(partida, "Arana");
  const w = mundo.world.world;
  /** Un cilindro de araña, 32×24 unidades y cinemático, como los de `solidosDeBichos`. */
  const cilindro = (donde) => {
    const b = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...donde));
    return w.createCollider(RAPIER.ColliderDesc.cylinder(12 / U, 16 / U), b);
  };
  let dentro = null, cerca = null;
  // El instrumento: cómo está cada cilindro MIENTRAS Rapier mueve al jugador.
  const ctl = mundo.world.controller;
  const original = ctl.computeColliderMovement.bind(ctl);
  let visto = null;
  ctl.computeColliderMovement = (...a) => {
    visto = { dentro: dentro?.isEnabled(), cerca: cerca?.isEnabled() };
    return original(...a);
  };
  let seq = 0;
  const unaOrden = () => partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: ++seq, msec: 10, adelante: 0 }] });

  await t.test("el que está DENTRO se aparta durante el paso y vuelve después", async () => {
    const p = c.cuerpo.feet;
    dentro = cilindro([p[0], p[1] + 0.6, p[2]]);
    // Uno a un metro, que sólo está cerca: el control de que esto no apaga bichos a ciegas.
    cerca = cilindro([p[0] + 1.2, p[1] + 12 / U, p[2]]);
    w.updateSceneQueries();
    visto = null;
    await unaOrden();
    assert.deepEqual(visto, { dentro: false, cerca: true }, "durante el paso");
    assert.equal(dentro.isEnabled(), true, "y al acabar vuelve a estar");
    assert.ok(c.bichosApartados >= 1);
  });

  await t.test("sin nada dentro no se aparta nada: el de al lado sigue contando", async () => {
    w.removeCollider(dentro, true);
    dentro = null;
    w.updateSceneQueries();
    const antes = c.bichosApartados;
    visto = null;
    await unaOrden();
    assert.deepEqual(visto, { dentro: undefined, cerca: true });
    assert.equal(c.bichosApartados, antes);
  });
});

// ── 3c. el tope de reloj por mensaje ────────────────────────────────────────

test("un paquete de órdenes no puede tener al servidor mucho más que su tope", async (t) => {
  const mundo = await mundoDe(juntar(rejilla(2, 200, 0)));
  const aparicion = { mapa: "liso", nacimiento: { nombre: "n", escena: [0, 0, 0] } };
  const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "p" });
  const { c } = await jugadorDentro(partida, "Lento");
  let seq = 0;
  const paquete = () => Array.from({ length: 20 }, () => ({ seq: ++seq, msec: 10, adelante: 1 }));
  const step = c.cuerpo.step.bind(c.cuerpo);
  let pasos = 0;
  c.cuerpo.step = (...a) => { pasos++; return step(...a); };

  await t.test("control: con pasos normales corren las veinte", async () => {
    pasos = 0;
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: paquete() });
    assert.equal(pasos, 20);
    assert.equal(c.sinTiempo ?? 0, 0);
  });

  await t.test(`con pasos de 80 ms se para al pasar ${TOPE_MS_POR_MENSAJE} ms, y el acuse sale igual`, async () => {
    // Un Rapier caro, simulado: cada paso espera 80 ms de reloj de pared
    // (lo medido con una araña dentro, §4 del doc, es 125).
    c.cuerpo.step = (...a) => { pasos++; const h = performance.now() + 80; while (performance.now() < h); return step(...a); };
    pasos = 0;
    const t0 = performance.now();
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: paquete() });
    // Lo que se afirma es la CUENTA, que no depende de lo cargada que esté la
    // máquina; el reloj se dice y no se afirma (con `npm test` en paralelo, una
    // pasada midió 558 ms con el tope bien). Sin el tope: 20 pasos y 1 600 ms.
    assert.ok(pasos >= 1 && pasos <= 4, `${pasos} pasos corridos de 20 en ${Math.round(performance.now() - t0)} ms`);
    assert.equal(c.sinTiempo, 20 - pasos, "las demás se cuentan sin correr");
    assert.equal(c.ultimaOrden, seq, "y el acuse llega hasta la última: el cliente no se queda esperando");
  });
});

// ── 4. lo que viene del cable ───────────────────────────────────────────────

test("una orden con números que no son números no llega a Rapier", async (t) => {
  await t.test("`orden()`: infinitos y NaN son cero", () => {
    const o = orden({ seq: NaN, msec: NaN, yaw: Infinity, cabeceo: -Infinity });
    assert.equal(o.seq, 0);
    assert.equal(o.msec, 0);
    assert.equal(o.yaw, 0);
    assert.equal(o.cabeceo, 0);
    // Y lo normal pasa igual que antes.
    assert.equal(orden({ yaw: 1.5 }).yaw, 1.5);
  });

  await t.test("un `yaw` infinito por el cable no deja al jugador paralítico para siempre", async () => {
    const mundo = await mundoDe(juntar(rejilla(2, 200, 0)));
    const aparicion = { mapa: "liso", nacimiento: { nombre: "n", escena: [0, 0, 0] } };
    const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "p" });
    const { c } = await jugadorDentro(partida, "Raro");
    // `Infinity` no viaja en JSON; un objeto ya abierto sí puede traerlo. Sin
    // `finito`, el seno da `NaN`, la VELOCIDAD se queda en `NaN` y, como cada
    // paso parte de la anterior, ya no se vuelve a mover nunca, aunque las
    // órdenes siguientes sean buenas (medido en el 99).
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: 1, msec: 20, adelante: 1, yaw: Infinity }] });
    assert.ok(c.cuerpo.vel.every(Number.isFinite), `velocidad ${c.cuerpo.vel}`);
    const antes = c.cuerpo.feet;
    for (let i = 2; i < 30; i++) {
      await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: i, msec: 20, adelante: 1, yaw: 0 }] });
    }
    const d = Math.hypot(c.cuerpo.feet[0] - antes[0], c.cuerpo.feet[2] - antes[2]);
    assert.ok(d > 0.5, `después anda: ${d.toFixed(2)} m`);
  });
});

// ── 5. Gate City, si está horneado ──────────────────────────────────────────

const HAY_GATECITY = existsSync("build/gatecity/malla.json");

test("Gate City: la peor roca medida no cuelga al servidor", { skip: !HAY_GATECITY && "sin build/gatecity", timeout: 120_000 }, async () => {
  const { mundoDeNivel, nivelDeDisco } = await import("../src/red/anfitrion.js");
  const { cargarNivel } = await import("../src/bsp/nivel.js");
  const { baseDe } = await import("../src/play/mapa.js");
  const level = await nivelDeDisco((o) => cargarNivel({ ...o, mapa: "gatecity" }), { base: baseDe("gatecity") });
  const mundo = mundoDeNivel(level);
  // El punto de nacer de antes del 99 —el rayo del templo, con la cápsula
  // cortando la pared—, escrito aquí para que la prueba no dependa del horneado.
  const viejo = [2.0320040640081283, -14.630429260858522, -70.86614173228347];
  const aparicion = { mapa: "gatecity", nacimiento: { nombre: "el rayo de antes", escena: viejo } };
  const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "gc" });
  const { c } = await jugadorDentro(partida, "Templo");
  const probar = probadorDe(c.cuerpo);
  assert.ok(probar(puntoDeAparicion(viejo)), "control: el rayo de antes deja la cápsula en la pared");
  assert.equal(probar(c.cuerpo.feet), null, "el servidor le pone donde cabe");
  // Y la peor medida: 1 888 ms en UN paso sin el arreglo.
  c.cuerpo.colocar([79.628, -6.186, -36.892]);
  assert.ok(probar(c.cuerpo.feet));
  const cuenta = contarMovimientos(mundo);
  for (let i = 1; i <= 100; i++) {
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: i, msec: 10 }] });
  }
  assert.equal(cuenta.n, 0, `${cuenta.n} movimientos de Rapier dentro de la roca`);
});
