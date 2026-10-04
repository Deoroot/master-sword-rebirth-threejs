// EL 100: el tope de reloj de pared POR SEGUNDO de `_correrOrdenes`
// (src/red/partida.js `TOPE_MS_POR_SEGUNDO`; doc/SERVIDOR_100.md §3).
//
// El cuelgue de la sonda del 99 tenía esta forma: `computeColliderMovement` a
// 100-250 ms por llamada y MUCHOS mensajes de una orden. El tope por mensaje
// deja correr siempre la primera, así que cada mensaje pagaba una entera y el
// servidor no volvía a contestar. Aquí se manda eso mismo —treinta mensajes de
// una orden, con un Rapier de 80 ms— por `partida.recibir`, que es por donde
// entran los del socket.
import test from "node:test";
import assert from "node:assert/strict";
import { World, Player, perfilMsr, initPhysics } from "../src/play/player.js";
import { Partida, TOPE_MS_POR_SEGUNDO } from "../src/red/partida.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE } from "../src/red/protocolo.js";

const U = 39.37;

function suelo(lado = 200) {
  const h = lado / 2;
  return {
    positions: new Float32Array([-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    triangleCount: 2,
  };
}

async function partidaLisa() {
  await initPhysics();
  const perfil = perfilMsr(U);
  const world = new World(suelo(), { perfil });
  const mundo = {
    world, perfil, triangulos: 2,
    crearCuerpo(pies) { return new Player(world, pies, { perfil }); },
    soltarCuerpo(cuerpo) { try { world.world.removeRigidBody(cuerpo.body); } catch { /* ya no estaba */ } },
  };
  const aparicion = { mapa: "liso", nacimiento: { nombre: "n", escena: [0, 0, 0] } };
  const partida = new Partida({ mundo, almacen: new AlmacenMemoria(), aparicion, nombre: "p" });
  const dentro = [];
  const buzon = { enviar: (t) => dentro.push(JSON.parse(t)), al: () => () => {} };
  const c = partida.conectar(buzon, { nombre: "Lento" });
  await partida.recibir(c.id, { t: MENSAJE.CREAR, personaje: { nombre: "Lento" } });
  const lista = [...dentro].reverse().find((m) => m.t === MENSAJE.LISTA).personajes;
  await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: lista.find((p) => p.nombre === "Lento").id });
  return { partida, c };
}

test("un Rapier caro no puede tener al servidor más que su tope por segundo, aunque llegue de mensaje en mensaje", async (t) => {
  const { partida, c } = await partidaLisa();
  const step = c.cuerpo.step.bind(c.cuerpo);
  let pasos = 0;
  let caro = 0;
  c.cuerpo.step = (...a) => { pasos++; if (caro) { const h = performance.now() + caro; while (performance.now() < h); } return step(...a); };
  let seq = 0;
  const mensajes = async (n) => { for (let i = 0; i < n; i++) await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: ++seq, msec: 10, adelante: 1 }] }); };

  await t.test("control: con pasos normales corren los treinta", async () => {
    pasos = 0; c.sinTiempo = 0;
    await mensajes(30);
    assert.equal(pasos, 30);
    assert.equal(c.sinTiempo, 0);
  });

  await t.test(`con pasos de 80 ms, sesenta mensajes de UNA orden: un segundo entero y luego ${TOPE_MS_POR_SEGUNDO} ms`, async () => {
    // Que empiece una ventana nueva, para que la cuenta no dependa de la anterior.
    await new Promise((r) => setTimeout(r, 2100));
    caro = 80; pasos = 0; c.sinTiempo = 0;
    const t0 = performance.now();
    await mensajes(60);
    const ms = performance.now() - t0;
    caro = 0;
    // La CUENTA, que no depende de la carga de la máquina. El primer segundo
    // corre entero (1000 / 80 = 12,5: trece pasos) porque el anterior no se
    // pasó; en el segundo, 250 / 80 son tres y uno que lo pasa; el resto se
    // cuenta sin correr. Sin el tope: 60 pasos y 4 800 ms. El margen de arriba
    // es para una máquina tan cargada que el reloj cruce otro segundo; el de
    // abajo, para una en la que el primer segundo dé para menos (medido: diez,
    // con la máquina al 100 %). Seis ya es más de lo que dejaba la versión que
    // mordía en el primer segundo (cuatro), que es lo que esto separa.
    assert.ok(pasos >= 6 && pasos <= 24, `${pasos} pasos de 60 en ${Math.round(ms)} ms`);
    assert.equal(c.sinTiempo, 60 - pasos, "los demás se cuentan sin correr");
    assert.equal(c.ultimaOrden, seq, "y el acuse llega hasta la última");
  });

  await t.test("un solo paso caro (700 ms, como el primero con la máquina cargada) no tira las órdenes buenas de detrás", async () => {
    await new Promise((r) => setTimeout(r, 2100));
    pasos = 0; c.sinTiempo = 0;
    let primero = true;
    c.cuerpo.step = (...a) => { pasos++; if (primero) { primero = false; const h = performance.now() + 700; while (performance.now() < h); } return step(...a); };
    await mensajes(30);
    assert.equal(pasos, 30);
    assert.equal(c.sinTiempo, 0);
    c.cuerpo.step = (...a) => { pasos++; if (caro) { const h = performance.now() + caro; while (performance.now() < h); } return step(...a); };
  });

  await t.test("un cliente que manda MÁS DEPRISA que el tiempo real, con órdenes que cuestan menos de lo que duran, no pierde ninguna", async () => {
    // Cada orden pide 16 ms y cuesta 5 de reloj: va por delante del reloj,
    // así que no se cuelga nada aunque llene un segundo entero. Es lo que hace
    // test/atasco100 («sesenta salidas por órdenes de verdad»: 3 600 órdenes
    // seguidas), que con la máquina cargada se ponía rojo con un tope que sólo
    // miraba el reloj.
    await new Promise((r) => setTimeout(r, 2100));
    pasos = 0; c.sinTiempo = 0; caro = 5;
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: ++seq, msec: 16, adelante: 1 }] });
    const ms = performance.now() - t0;
    caro = 0;
    assert.ok(ms > 1200, `control: la ráfaga tiene que llenar más de un segundo (${Math.round(ms)} ms)`);
    assert.equal(pasos, 300, `${pasos} de 300 en ${Math.round(ms)} ms`);
    assert.equal(c.sinTiempo, 0);
  });

  await t.test("y el segundo siguiente vuelve a correr: el tope no castiga para siempre", async () => {
    await new Promise((r) => setTimeout(r, 1050));
    pasos = 0;
    await mensajes(5);
    assert.equal(pasos, 5);
  });
});

// ── los guardados del mismo personaje, en fila (src/red/archivos.js) ───────
test("dos guardados del mismo personaje a la vez no revientan, y queda el último", async () => {
  const { AlmacenArchivos } = await import("../src/red/archivos.js");
  const { crearPersonaje } = await import("../src/juego/personaje.js");
  const { mkdtempSync, rmSync, readdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "servidor100-"));
  try {
    const a = new AlmacenArchivos({ carpeta: dir });
    const p = crearPersonaje({ nombre: "Carrera" });
    await a.escribir(p);
    // Veinte parejas, como la muerte y la vuelta guardando a la vez. Sin la
    // fila: 12 fallos de 40 (ENOENT al renombrar el temporal ya movido).
    let fallos = 0;
    for (let i = 0; i < 20; i++) {
      const r = await Promise.allSettled([a.escribir({ ...p, nombre: `Uno${i}` }), a.escribir({ ...p, nombre: `Dos${i}` })]);
      fallos += r.filter((x) => x.status === "rejected").length;
    }
    assert.equal(fallos, 0);
    assert.equal((await a.leer(p.id)).personaje.nombre, "Dos19", "el último que se pidió es el que queda");
    assert.ok(!readdirSync(dir).some((n) => n.endsWith(".tmp")), "ningún temporal huérfano");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
