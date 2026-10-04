// EL 100: `PM_CheckStuck` y los bichos de dentro, TAMBIÉN EN EL NAVEGADOR.
//
// El 99 los portó al servidor (`Partida._atascado` y `_bichosDentro`,
// test/reaparecer99.test.mjs). El navegador seguía llamando a `player.step` a
// pelo: en solitario, Rapier calculaba desde dentro de la roca y con el
// cilindro de una araña metido en la cápsula. Ahora los dos lados usan las
// mismas funciones de src/play/atasco.js, y el navegador entra por
// `PasoLocal.step`, que es lo que llama src/main.js. Estas pruebas entran por
// ahí también, con un `Player` y un mundo de Rapier de verdad (el 59: nada de
// construirle el argumento a la regla).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PasoLocal, probadorDe, HOLGURA_UNIDADES } from "../src/play/atasco.js";
import { World, Player, perfilMsr, initPhysics } from "../src/play/player.js";

const U = 39.37;
const DT = 1 / 60;

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

/** La roca de capas del 99 (test/reaparecer99): 48 000 triángulos en 1,8 m, en x = 20. */
function mallaDeRoca() {
  const capas = [];
  for (let k = 0; k < 5; k++) capas.push(rejilla(40, 4, (k * 1.8) / 5));
  return juntar(rejilla(2, 200, 0), ...capas.map((m) => ({ positions: m.positions.map((v, i) => (i % 3 === 0 ? v + 20 : v)), indices: m.indices })));
}

async function jugadorEn(malla, pies) {
  await initPhysics();
  const perfil = perfilMsr(U);
  const world = new World(malla, { perfil });
  const player = new Player(world, pies, { perfil });
  return { world, player, paso: new PasoLocal(player) };
}

function contarMovimientos(world) {
  const ctl = world.controller;
  const original = ctl.computeColliderMovement.bind(ctl);
  const cuenta = { n: 0 };
  ctl.computeColliderMovement = (...a) => { cuenta.n++; return original(...a); };
  return cuenta;
}

/** Un cilindro cinemático como los de `solidosDeBichos` (src/play/solidos.js). */
async function cilindro(world, pies, { alto = 72 / U, radio = 16 / U } = {}) {
  const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
  const w = world.world;
  const b = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pies[0], pies[1] + alto / 2, pies[2]));
  const col = w.createCollider(RAPIER.ColliderDesc.cylinder(alto / 2, radio), b);
  w.updateSceneQueries();
  return { b, col, alto };
}

const andar = (quien, n, input = { forward: 1, maxima: 190 }) => { for (let i = 0; i < n; i++) quien.step(DT, input); };
const plano = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// ── 0. el navegador entra por aquí ──────────────────────────────────────────

test("src/main.js da TODOS los pasos del jugador por `PasoLocal`", () => {
  // Leído del fuente porque main.js no se puede importar en Node. Lo que se
  // pide es que no quede un `player.step(` suelto: ése es el camino que no
  // pregunta, y es justo el que había hasta el 99.
  const src = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(src, /new PasoLocal\(player\)/);
  assert.match(src, /pasoLocal\.step\(dtCuerpo/, "el bucle de paso fijo");
  assert.match(src, /\(cuerpo === player \? pasoLocal : cuerpo\)\.step\(/, "la orden rehecha tras una corrección");
  assert.doesNotMatch(src, /\bplayer\.step\(/, "un `player.step(` a pelo en main.js");
});

// ── 1. metido en la roca ────────────────────────────────────────────────────

test("en solitario, metido en la roca: Rapier no calcula NI UN movimiento", { timeout: 60_000 }, async (t) => {
  const { world, player, paso } = await jugadorEn(mallaDeRoca(), [0, 0.02, 0]);
  const cuenta = contarMovimientos(world);
  const probar = probadorDe(player);

  await t.test("control positivo: en lo libre, cada paso SÍ llama a Rapier y anda", () => {
    assert.equal(probar(player.feet), null);
    const antes = player.feet;
    andar(paso, 30);
    assert.equal(cuenta.n, 30, `${cuenta.n} movimientos en 30 pasos`);
    assert.ok(plano(player.feet, antes) > 0.5, `anduvo ${plano(player.feet, antes).toFixed(2)} m`);
    assert.equal(paso.cuenta.parados, 0);
  });

  await t.test("dentro: 300 pasos, 0 llamadas, y no se mueve", () => {
    player.colocar([20.03, 0.01, 0.02]);
    world.world.updateSceneQueries();
    assert.ok(probar(player.feet), "el instrumento ve el atasco");
    const n0 = cuenta.n, p0 = player.feet;
    const t0 = performance.now();
    andar(paso, 300);
    const ms = performance.now() - t0;
    assert.equal(cuenta.n - n0, 0, `${cuenta.n - n0} llamadas a computeColliderMovement`);
    assert.ok(paso.cuenta.parados >= 300, `${paso.cuenta.parados} pasos parados`);
    assert.ok(plano(player.feet, p0) < 0.01);
    // Red de seguridad, no medida: sin el arreglo son segundos con esta malla.
    assert.ok(ms < 5000, `${Math.round(ms)} ms para 300 pasos`);
  });

  await t.test("y el camino viejo (`player.step` a pelo) SÍ llama a Rapier ahí: el arreglo es lo que lo para", () => {
    const n0 = cuenta.n;
    player.step(DT, { forward: 1, maxima: 190 });
    assert.equal(cuenta.n - n0, 1);
  });
});

// ── 2. el mundo sigue mientras el jugador está parado ───────────────────────

test("con el jugador atascado, el mundo sigue: los cilindros llegan a donde se les manda", async () => {
  const { world, player, paso } = await jugadorEn(mallaDeRoca(), [20.03, 0.01, 0.02]);
  const { b } = await cilindro(world, [-5, 0, -5]);
  b.setNextKinematicTranslation({ x: -3, y: 72 / U / 2, z: -5 });
  paso.step(DT, { forward: 1, maxima: 190 });
  assert.equal(paso.cuenta.parados, 1, "control: el paso SÍ ha estado parado");
  assert.ok(Math.abs(b.translation().x + 3) < 1e-4, `el cilindro está en x = ${b.translation().x.toFixed(3)}`);
});

// ── 3. un bicho DENTRO ──────────────────────────────────────────────────────

test("un bicho metido en el jugador: se aparta durante su paso y el jugador sale andando", async (t) => {
  await t.test("el de dentro se apaga MIENTRAS Rapier mueve, y vuelve después; el de al lado no", async () => {
    const { world, player, paso } = await jugadorEn(juntar(rejilla(2, 200, 0)), [0, 0.02, 0]);
    const dentro = await cilindro(world, player.feet);
    const cerca = await cilindro(world, [player.feet[0] + 1.5, 0, player.feet[2]]);
    const ctl = world.controller;
    const original = ctl.computeColliderMovement.bind(ctl);
    let visto = null;
    ctl.computeColliderMovement = (...a) => { visto = { dentro: dentro.col.isEnabled(), cerca: cerca.col.isEnabled() }; return original(...a); };
    paso.step(DT, { forward: 0 });
    assert.deepEqual(visto, { dentro: false, cerca: true });
    assert.equal(dentro.col.isEnabled(), true);
    assert.equal(paso.cuenta.apartados, 1);
  });

  // El cilindro alto (72 unidades, el que no se puede pisar) clavado en los
  // pies. Medido en el 100: con `player.step` a pelo el controlador lo
  // empuja contra la cápsula y el jugador no sale.
  const salir = async (conArreglo) => {
    const { world, player, paso } = await jugadorEn(juntar(rejilla(2, 200, 0)), [0, 0.02, 0]);
    for (let i = 0; i < 10; i++) paso.step(DT, {});
    await cilindro(world, player.feet);
    const p0 = player.feet;
    andar(conArreglo ? paso : player, 90);
    return plano(player.feet, p0);
  };

  await t.test("con `PasoLocal`, en 1,5 s anda más de un metro", async () => {
    const d = await salir(true);
    assert.ok(d > 1, `anduvo ${d.toFixed(2)} m`);
  });

  await t.test("CONTROL: con el camino viejo se queda dentro (menos de medio metro)", async () => {
    const d = await salir(false);
    assert.ok(d < 0.5, `anduvo ${d.toFixed(2)} m`);
  });

  await t.test("CONTROL POSITIVO: uno DELANTE, que sólo toca, le sigue parando", async () => {
    const { world, player, paso } = await jugadorEn(juntar(rejilla(2, 200, 0)), [0, 0.02, 0]);
    for (let i = 0; i < 10; i++) paso.step(DT, {});
    // yaw 0 mira hacia −z: el cilindro a 1,2 m por delante.
    await cilindro(world, [player.feet[0], 0, player.feet[2] - 1.2]);
    const p0 = player.feet;
    andar(paso, 90);
    const d = plano(player.feet, p0);
    assert.ok(d < 0.6, `anduvo ${d.toFixed(2)} m contra el cilindro`);
    assert.equal(paso.cuenta.apartados, 0, "y nunca lo ha apartado");
  });
});

// ── 3b. lo que la sonda enseñó: uno sí y uno no, y el borde ─────────────────

test("salir de un bicho: CADA paso avanza, y no se queda clavado en el borde", async (t) => {
  await t.test("con el cilindro dentro, ningún paso se queda en nada (el árbol de consultas al día)", async () => {
    // Sin `updateSceneQueries` tras `setEnabled`, un paso de cada dos el
    // controlador seguía chocando con el apagado: 0,06 cm contra 8 cm.
    const { world, player, paso } = await jugadorEn(juntar(rejilla(2, 200, 0)), [0, 0.02, 0]);
    for (let i = 0; i < 5; i++) paso.step(DT, {});
    const c = await cilindro(world, [player.feet[0], 0, player.feet[2] + 0.1], { alto: 88 / U, radio: 19 / U });
    player.yaw = 0.3;
    const avances = [];
    for (let i = 0; i < 12; i++) {
      const a = player.feet;
      paso.step(DT, { forward: 1, maxima: 190 });
      avances.push(plano(player.feet, a));
    }
    // Desde el segundo paso (el primero arranca de parado).
    const peor = Math.min(...avances.slice(1));
    assert.ok(peor > 0.01, `el peor paso con el cilindro dentro avanzó ${(peor * 100).toFixed(2)} cm: ${avances.map((x) => (x * 100).toFixed(1)).join(" ")}`);
    assert.ok(c.col.isEnabled());
  });

  await t.test("cuatrocientas salidas al azar, por `PasoLocal`: ninguna se queda clavada", async () => {
    // Medido en el 100: sin el arreglo del borde, 50 de 400 se quedaban a
    // 0,6-1,8 cm del cilindro, con la velocidad entera y sin moverse.
    await initPhysics();
    const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
    const perfil = perfilMsr(U);
    const world = new World(juntar(rejilla(2, 200, 0)), { perfil });
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    const clavados = [];
    for (let k = 0; k < 400; k++) {
      const player = new Player(world, [0, 0.02, 0], { perfil });
      const paso = new PasoLocal(player);
      for (let i = 0; i < 5; i++) paso.step(DT, {});
      const f = player.feet;
      const alto = (24 + azar() * 72) / U, radio = (10 + azar() * 14) / U;
      const ang = azar() * Math.PI * 2, lejos = azar() * (radio + perfil.radius) * 0.95;
      const b = world.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(f[0] + Math.sin(ang) * lejos, f[1] + alto / 2, f[2] + Math.cos(ang) * lejos));
      const col = world.world.createCollider(RAPIER.ColliderDesc.cylinder(alto / 2, radio), b);
      world.world.updateSceneQueries();
      player.yaw = azar() * Math.PI * 2;
      for (let i = 0; i < 60; i++) paso.step(DT, { forward: 1, maxima: 190 });
      const d = plano(player.feet, f);
      if (d < 1.5) clavados.push(d.toFixed(2));
      world.world.removeCollider(col, true);
      world.world.removeRigidBody(b);
      world.world.removeRigidBody(player.body);
    }
    assert.equal(clavados.length, 0, `${clavados.length} de 400 clavados (anduvieron ${clavados.slice(0, 5).join(", ")} m)`);
  });
});

test("y EL SERVIDOR, que usa las mismas piezas: sesenta salidas por órdenes de verdad, ninguna clavada", { timeout: 120_000 }, async () => {
  const { Partida } = await import("../src/red/partida.js");
  const { AlmacenMemoria } = await import("../src/juego/almacen.js");
  const { MENSAJE } = await import("../src/red/protocolo.js");
  const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
  await initPhysics();
  const perfil = perfilMsr(U);
  const world = new World(juntar(rejilla(2, 200, 0)), { perfil });
  const mundo = {
    world, perfil,
    crearCuerpo(pies) { return new Player(world, pies, { perfil }); },
    soltarCuerpo(cuerpo) { try { world.world.removeRigidBody(cuerpo.body); } catch { /* ya no estaba */ } },
  };
  const aparicion = { mapa: "liso", nacimiento: { nombre: "n", escena: [0, 0, 0] } };
  const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "p" });
  const enviados = [];
  const b = { enviar: (t) => enviados.push(JSON.parse(t)), al: () => () => {} };
  const c = partida.conectar(b, { nombre: "Sale" });
  await partida.recibir(c.id, { t: MENSAJE.CREAR, personaje: { nombre: "Sale" } });
  const lista = [...enviados].reverse().find((m) => m.t === MENSAJE.LISTA).personajes;
  await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: lista.find((p) => p.nombre === "Sale").id });
  let semilla = 11, seq = 0;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  const clavados = [];
  for (let k = 0; k < 60; k++) {
    c.cuerpo.colocar([0, 0.02, 0], { velocidad: [0, 0, 0] });
    world.world.updateSceneQueries();
    const f = c.cuerpo.feet;
    const alto = (24 + azar() * 72) / U, radio = (10 + azar() * 14) / U;
    const ang = azar() * Math.PI * 2, lejos = azar() * (radio + perfil.radius) * 0.95;
    const cuerpo = world.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(f[0] + Math.sin(ang) * lejos, f[1] + alto / 2, f[2] + Math.cos(ang) * lejos));
    const col = world.world.createCollider(RAPIER.ColliderDesc.cylinder(alto / 2, radio), cuerpo);
    world.world.updateSceneQueries();
    const yaw = azar() * Math.PI * 2;
    for (let i = 0; i < 60; i++) {
      await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: ++seq, msec: 16, adelante: 1, yaw }] });
    }
    const d = plano(c.cuerpo.feet, f);
    if (d < 1.5) clavados.push(d.toFixed(2));
    world.world.removeCollider(col, true);
    world.world.removeRigidBody(cuerpo);
  }
  assert.ok(c.bichosApartados > 0, "control: el servidor SÍ ha apartado cilindros");
  assert.equal(clavados.length, 0, `${clavados.length} de 60 clavados (anduvieron ${clavados.slice(0, 5).join(", ")} m)`);
});

// ── 4. la rama del CLIENTE: los 54 intentos ─────────────────────────────────

test("`PasoLocal` es el CLIENTE (`pmove->server = 0`): hundido en el suelo, la tabla le saca en el primer paso", async () => {
  // Hundido HOLGURA + 3 cm: la cápsula encogida corta el suelo. Los empujones
  // de la tabla suben hasta 6 unidades (15 cm), así que uno le saca.
  const hundido = HOLGURA_UNIDADES / U + 0.03;
  const { player, paso } = await jugadorEn(juntar(rejilla(2, 200, 0)), [0, 0, 0]);
  const probar = probadorDe(player);
  player.colocar([0, -hundido, 0]);
  player.world.world.updateSceneQueries();
  assert.ok(probar(player.feet), "control: hundido, no cabe");
  paso.step(DT, {});
  assert.equal(paso.atasco.sacado, 1, "le ha sacado la tabla");
  assert.equal(paso.cuenta.parados, 0, "y ese paso SÍ se ha movido");
  assert.equal(paso.atasco.servidor, false);
});
