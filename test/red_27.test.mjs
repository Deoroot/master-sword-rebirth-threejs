// LA RED, comprobada en Node plano: sin navegador y, casi todo, sin sockets.
//
// Cuatro bloques y cada uno tiene su propio oráculo, que es lo que los hace
// valer:
//
//   1. el marco        los vectores del RFC 6455 §5.7, escritos por quien
//                      definió el formato. No los hemos elegido nosotros.
//   2. las cifras      el código del motor, con su archivo y su línea.
//   3. la partida      la autoridad: lo que un cliente NO puede hacer.
//   4. el cliente      predicción y reconciliación, contra una partida de
//                      verdad —con Rapier y la física de Master Sword— unida
//                      por un cable de mentira que se puede parar y perder
//                      paquetes a mano.
//
// Lo que estas pruebas NO dicen: que dos navegadores se vean. Eso es
// `npm run sonda:red`, y hace falta porque aquí los dos lados del marco son
// nuestros: si estuviera mal de forma simétrica, se entenderían igual.

import test from "node:test";
import assert from "node:assert/strict";

import {
  enmarcar, aplicarMascara, Desenmarcador, aceptacion, OPCODE, GUID,
  cuerpoDeCierre, leerCierre,
} from "../src/red/marco.js";
import {
  RED, VERSION, MENSAJE, intervaloDeEnvio, interpolacion, partirOrden,
  recuperarPerdidas, tiempoObjetivo, orden, empaquetar, abrir, BOTON,
} from "../src/red/protocolo.js";
import { Partida } from "../src/red/partida.js";
import { ClienteDeRed, AlmacenRemoto, UMBRAL_DE_CORRECCION } from "../src/red/cliente.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { servir, conectar } from "../src/red/socket.js";

const APARICION = {
  mapa: "liso",
  nacimiento: { nombre: "el centro", escena: [0, 0.2, 0] },
  reaparicion: { nombre: "el centro", escena: [0, 0.2, 0] },
};

// ── 1. EL MARCO, contra los vectores del RFC ───────────────────────────────

test("el marco de un WebSocket, contra los vectores del RFC 6455", async (t) => {
  await t.test("§1.3: la clave del apretón de manos es la del ejemplo", () => {
    // El RFC trae el ejemplo entero: esta clave da esta aceptación. Si esto
    // falla, ningún navegador del mundo abre la conexión.
    assert.equal(aceptacion("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    assert.equal(GUID, "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
  });

  await t.test("§5.7: «Hello» sin máscara son siete bytes exactos", () => {
    const b = enmarcar("Hello", { opcode: OPCODE.texto });
    assert.deepEqual([...b], [0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  await t.test("§5.7: «Hello» CON máscara, con la clave del ejemplo", () => {
    const mascara = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
    const b = enmarcar("Hello", { opcode: OPCODE.texto, mascara });
    assert.deepEqual([...b], [0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58]);
  });

  await t.test("la máscara es su propia inversa", () => {
    const m = Buffer.from([1, 2, 3, 4]);
    const datos = Buffer.from("cualquier cosa, incluso con eñes y acentos", "utf8");
    assert.deepEqual([...aplicarMascara(aplicarMascara(datos, m), m)], [...datos]);
  });

  await t.test("§5.7: el mismo «Hello» partido en dos marcos se junta", () => {
    // 0x01 = texto sin FIN, 0x80 = continuación con FIN. El segundo NO lleva
    // opcode de texto: lleva cero, y eso es lo que más se hace mal.
    const d = new Desenmarcador();
    assert.deepEqual(d.empujar(Buffer.from([0x01, 0x03, 0x48, 0x65, 0x6c])), []);
    const [m] = d.empujar(Buffer.from([0x80, 0x02, 0x6c, 0x6f]));
    assert.equal(m.opcode, OPCODE.texto);
    assert.equal(m.datos.toString("utf8"), "Hello");
  });

  await t.test("un marco partido en bytes sueltos llega igual", () => {
    // El caso normal en una red de verdad, y el que no se ve en la máquina de
    // quien lo escribe: TCP entrega bytes, no mensajes.
    const b = enmarcar("una frase con la longitud suficiente para partirse");
    const d = new Desenmarcador();
    let salida = [];
    for (const byte of b) salida = salida.concat(d.empujar(Buffer.from([byte])));
    assert.equal(salida.length, 1);
    assert.equal(salida[0].datos.toString("utf8"), "una frase con la longitud suficiente para partirse");
  });

  await t.test("dos marcos en el mismo trozo salen los dos", () => {
    const d = new Desenmarcador();
    const salida = d.empujar(Buffer.concat([enmarcar("uno"), enmarcar("dos")]));
    assert.deepEqual(salida.map((m) => m.datos.toString("utf8")), ["uno", "dos"]);
  });

  await t.test("los tres tamaños de largo, y el 126 no cabe en el corto", () => {
    // 125 es el último que cabe en el byte; 126 ya necesita los dos extra.
    assert.equal(enmarcar(Buffer.alloc(125))[1] & 0x7f, 125);
    assert.equal(enmarcar(Buffer.alloc(126))[1] & 0x7f, 126);
    assert.equal(enmarcar(Buffer.alloc(65535))[1] & 0x7f, 126);
    assert.equal(enmarcar(Buffer.alloc(65536))[1] & 0x7f, 127);
    for (const n of [0, 1, 125, 126, 65535, 65536]) {
      const d = new Desenmarcador();
      const [m] = d.empujar(enmarcar(Buffer.alloc(n, 7), { opcode: OPCODE.binario }));
      assert.equal(m.datos.length, n, `un marco de ${n} bytes`);
    }
  });

  await t.test("un marco de cliente SIN máscara rompe la conexión (§5.1)", () => {
    const d = new Desenmarcador({ exigirMascara: true });
    d.empujar(enmarcar("Hello"));            // sin máscara: eso lo hace el servidor
    assert.equal(d.roto?.codigo, 1002);
  });

  await t.test("un marco de control fragmentado o largo también (§5.5)", () => {
    const a = new Desenmarcador();
    a.empujar(Buffer.from([0x09, 0x00]));     // ping sin FIN
    assert.equal(a.roto?.codigo, 1002);
    const b = new Desenmarcador();
    b.empujar(enmarcar(Buffer.alloc(126), { opcode: OPCODE.ping }));
    assert.equal(b.roto?.codigo, 1002);
  });

  await t.test("una continuación sin nada que continuar, y un mensaje sobre otro", () => {
    const a = new Desenmarcador();
    a.empujar(Buffer.from([0x80, 0x01, 0x41]));
    assert.equal(a.roto?.codigo, 1002);
    const b = new Desenmarcador();
    b.empujar(Buffer.from([0x01, 0x01, 0x41]));       // texto sin FIN
    b.empujar(Buffer.from([0x81, 0x01, 0x42]));       // otro texto encima
    assert.equal(b.roto?.codigo, 1002);
  });

  await t.test("un marco enorme se rechaza antes de reservar memoria", () => {
    const d = new Desenmarcador({ maximo: 1024 });
    // 0x7F + ocho bytes que anuncian 16 GiB. Ni un byte de carga: el rechazo
    // tiene que llegar por lo que ANUNCIA, no por lo que mande.
    d.empujar(Buffer.from([0x82, 0x7f, 0, 0, 0, 4, 0, 0, 0, 0]));
    assert.equal(d.roto?.codigo, 1009);
  });

  await t.test("el cierre lleva su código y su motivo, y el motivo se recorta", () => {
    assert.deepEqual(leerCierre(cuerpoDeCierre(1002, "mal")), { codigo: 1002, motivo: "mal" });
    // 123 y no 125: los dos primeros bytes son el código.
    assert.equal(cuerpoDeCierre(1000, "x".repeat(300)).length, 125);
    assert.deepEqual(leerCierre(Buffer.alloc(0)), { codigo: 1005, motivo: "" });
  });
});

// ── 2. LAS CIFRAS, contra el código del motor ──────────────────────────────

test("las cifras de la red salen del motor y no de nosotros", async (t) => {
  await t.test("las que se copian tal cual", () => {
    assert.equal(RED.ticrate, 100);            // sys_ticrate, host.c:67
    assert.equal(RED.maxUpdaterate, 30);       // sv_main.cpp:191
    assert.equal(RED.exInterp, 0.1);           // cl_main.c:70 y client.h:112
    assert.equal(RED.cmdbackup, 10);           // cl_main.c:53
    assert.equal(RED.cmdbackupMax, 16);        // BIT(4), protocol.h:170-171
    assert.equal(RED.historia, 64);            // netchan.h:75
    assert.equal(RED.maxUnlag, 0.5);           // sv_user.cpp:57
    assert.equal(RED.maxJugadores, 32);        // const.h:23
    assert.equal(RED.maxOrdenesPerdidas, 24);  // sv_user.cpp:1526
    assert.equal(RED.ventanaDelReloj, 0.5);    // net_ws.cpp:83
  });

  await t.test("SV_CheckUpdateRate: pedir 4 no da 4, da 10", () => {
    // `if (i >= 10) 1/i; else 0.1` — por debajo de diez se ignora la petición.
    assert.equal(intervaloDeEnvio(4), 0.1);
    assert.equal(intervaloDeEnvio(0), 0.1);
    assert.equal(intervaloDeEnvio(20), 0.05);
  });

  await t.test("y pedir 100 tampoco da 100: sv_maxupdaterate lo baja a 30", () => {
    assert.equal(Math.round(1 / intervaloDeEnvio(100)), 30);
    assert.equal(Math.round(1 / intervaloDeEnvio(1000)), 30);
  });

  await t.test("ex_interp tiene un SUELO que depende de cl_updaterate", () => {
    // Es lo que impide bajar la interpolación a cero para «ver en directo»:
    // con 20 actualizaciones por segundo, el mínimo son 50 ms.
    assert.equal(interpolacion(0, 20), 0.05);
    assert.equal(interpolacion(0.001, 20), 0.05);
    assert.equal(interpolacion(0.1, 20), 0.1);
    // Y un techo: MAX_EX_INTERP es 0,1 y pedir más no sube.
    assert.equal(interpolacion(0.5, 20), 0.1);
    // Con 100 actualizaciones el suelo baja a 10 ms.
    assert.equal(Math.round(interpolacion(0.01, 100) * 1000), 10);
  });

  await t.test("SV_RunCmd parte por la mitad, y PIERDE un milisegundo", () => {
    assert.deepEqual(partirOrden(16), [16]);
    assert.deepEqual(partirOrden(50), [50]);
    // 51 se parte en 25 y 25: el `(byte)` trunca las DOS mitades del mismo
    // cálculo, así que no se reparte el impar — se pierde.
    assert.deepEqual(partirOrden(51), [25, 25]);
    assert.equal(partirOrden(51).reduce((a, b) => a + b), 50);
    // Y con el tope del byte la pérdida se ACUMULA, porque la partición es
    // recursiva: 255 → dos de 127 → cuatro de 63 → ocho de 31 = 248. Siete
    // milisegundos perdidos, no uno. (Aquí me equivoqué al escribir la prueba:
    // esperaba 254 dando por hecho una sola partición, y la medida mandó.)
    assert.deepEqual(partirOrden(255), Array(8).fill(31));
    assert.equal(partirOrden(255).reduce((a, b) => a + b), 248);
    // 200 se parte dos veces: cuatro de 50.
    assert.deepEqual(partirOrden(200), [50, 50, 50, 50]);
  });

  await t.test("SV_EstablishTimeBase: 24 perdidas es abandonar la ráfaga", () => {
    assert.deepEqual(recuperarPerdidas(3, 10), { repetirUltima: 0, viejasQueCorrer: 3, abandonado: false });
    assert.deepEqual(recuperarPerdidas(13, 10), { repetirUltima: 3, viejasQueCorrer: 10, abandonado: false });
    assert.equal(recuperarPerdidas(24, 10).abandonado, true);
    assert.equal(recuperarPerdidas(24, 10).repetirUltima, 0);
  });

  await t.test("la compensación rebobina la latencia MÁS la interpolación", () => {
    // El fallo clásico es restar sólo la latencia: entonces el servidor mira
    // 100 ms después de lo que el tirador veía.
    const t = tiempoObjetivo({ ahora: 10, latencia: 0.08, lerpMsec: 100, intervalo: 0.05 });
    assert.equal(Math.round((10 - t) * 1000), 180);
  });

  await t.test("y tiene tres topes, los tres del motor", () => {
    // sv_maxunlag: medio segundo, aunque la latencia sea de tres.
    const a = tiempoObjetivo({ ahora: 10, latencia: 3, lerpMsec: 0, intervalo: 0.05 });
    assert.equal(Math.round((10 - a) * 1000), 550);     // 500 de retardo + 50 de intervalo
    // el lerp_msec del cliente no puede pasar de 0,1 s
    const b = tiempoObjetivo({ ahora: 10, latencia: 0, lerpMsec: 5000, intervalo: 0.05 });
    assert.equal(Math.round((10 - b) * 1000), 100);
    // y nunca se mira al futuro
    const c = tiempoObjetivo({ ahora: 10, latencia: -5, lerpMsec: 0, intervalo: 0 });
    assert.equal(c, 10);
  });

  await t.test("el sobre: versión, tipo, y lo roto se tira sin lanzar", () => {
    const m = abrir(empaquetar(MENSAJE.HOLA, { nombre: "x" }));
    assert.equal(m.t, MENSAJE.HOLA);
    assert.equal(m.v, VERSION);
    assert.equal(abrir("{no es json"), null);
    assert.equal(abrir("[1,2,3]"), null);
    assert.equal(abrir(JSON.stringify({ v: 99, t: "hola" })), null);
    assert.equal(abrir(JSON.stringify({ v: VERSION })), null);
  });
});

// ── 3. LA PARTIDA: lo que un cliente NO puede hacer ────────────────────────

/** Un enlace de mentira que guarda lo que se le manda. */
function buzon() {
  const dentro = [];
  return {
    dentro,
    enviar: (texto) => dentro.push(JSON.parse(texto)),
    ultimo: (tipo) => [...dentro].reverse().find((m) => m.t === tipo) ?? null,
    todos: (tipo) => dentro.filter((m) => m.t === tipo),
    al: () => () => {},
  };
}

async function partidaLista() {
  const mundo = await mundoLiso();
  const almacen = new AlmacenMemoria();
  const partida = new Partida({ mundo, almacen, aparicion: APARICION, nombre: "prueba" });
  return { mundo, almacen, partida };
}

async function jugadorDentro(partida, nombre = "Uno") {
  const b = buzon();
  const c = partida.conectar(b, { nombre });
  await partida.recibir(c.id, { t: MENSAJE.CREAR, personaje: { nombre } });
  const lista = b.ultimo(MENSAJE.LISTA).personajes;
  await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: lista[0].id });
  return { b, c, id: lista[0].id };
}

test("la partida es la autoridad", async (t) => {
  await t.test("el personaje se lee del almacén del SERVIDOR, no del mensaje", async () => {
    const { partida, almacen } = await partidaLista();
    const { b, c } = await jugadorDentro(partida, "Honrado");
    const dado = b.ultimo(MENSAJE.APARECES).personaje;
    const enDisco = (await almacen.leer(dado.id)).personaje;
    assert.equal(dado.nombre, "Honrado");
    assert.deepEqual(dado.habilidades, enDisco.habilidades);
    assert.ok(c.cuerpo, "tiene cuerpo en el mundo");
  });

  await t.test("mandar «adelante: 1000» no anda mil veces más", async () => {
    // La defensa no es una comprobación: es que lo único que se puede mandar
    // es intención, y la intención está recortada a [-1, 1] en `orden()`.
    const { partida } = await partidaLista();
    const { c } = await jugadorDentro(partida, "Tramposo");
    const { partida: p2 } = await partidaLista();
    const { c: honrado } = await jugadorDentro(p2, "Honrado");
    for (let i = 1; i <= 60; i++) {
      await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: i, msec: 16, adelante: 1000 }] });
      await p2.recibir(honrado.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: i, msec: 16, adelante: 1 }] });
      partida.avanzar(0.016);
      p2.avanzar(0.016);
    }
    const tramposo = Math.hypot(c.cuerpo.feet[0], c.cuerpo.feet[2]);
    const limpio = Math.hypot(honrado.cuerpo.feet[0], honrado.cuerpo.feet[2]);
    assert.ok(tramposo > 1, "se ha movido, claro");
    assert.ok(Math.abs(tramposo - limpio) < 0.01, `el tramposo anda ${tramposo.toFixed(2)} y el honrado ${limpio.toFixed(2)}`);
  });

  await t.test("mandar el doble de órdenes hace que se le ignore medio segundo", async () => {
    // `SV_CheckCmdTimes`: el reloj del cliente se adelanta y a la vuelta del
    // segundo se le corta. El honrado, con el mismo tiempo, no se entera.
    const { partida } = await partidaLista();
    const { c } = await jugadorDentro(partida, "Acelerado");
    let seq = 0;
    // 250 órdenes de 16 ms son cuatro segundos pedidos; de verdad pasan dos. El
    // chequeo es UNA VEZ POR SEGUNDO, como el del motor, así que hay que dejar
    // que pase al menos uno — con menos de un segundo de partida esto no salta
    // aunque el cliente vaya al doble.
    for (let i = 0; i < 250; i++) {
      await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: ++seq, msec: 16, adelante: 1 }] });
      partida.avanzar(0.008);
    }
    assert.ok(c.ignoradas > 0, `se le ignoraron ${c.ignoradas} órdenes`);
    assert.ok(partida.sucesos.some((s) => s.que === "reloj"), "y queda apuntado");
  });

  await t.test("ir por DETRÁS no se castiga: eso es mala conexión", async () => {
    const { partida } = await partidaLista();
    const { c } = await jugadorDentro(partida, "Lento");
    for (let i = 0; i < 60; i++) {
      await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: i + 1, msec: 16, adelante: 1 }] });
      partida.avanzar(0.1);                   // el servidor va muy por delante
    }
    assert.equal(c.ignoradas, 0);
  });

  await t.test("una orden repetida por el respaldo no se corre dos veces", async () => {
    const { partida } = await partidaLista();
    const { c } = await jugadorDentro(partida, "Repetido");
    const lote = [1, 2, 3].map((seq) => ({ seq, msec: 20, adelante: 1 }));
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: lote });
    const tras = [...c.cuerpo.feet];
    // El mismo lote otra vez, que es lo que manda `cl_cmdbackup` cada vez.
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: lote });
    assert.deepEqual(c.cuerpo.feet, tras);
    assert.equal(c.ultimaOrden, 3);
  });

  await t.test("lo perdido se repite con la última orden, no se inventa", async () => {
    const { partida } = await partidaLista();
    const { c } = await jugadorDentro(partida, "Perdido");
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: 1, msec: 20, adelante: 1 }] });
    // Se pierden de la 2 a la 15 y llega la 16: catorce huecos, y sólo diez
    // caben en el respaldo, así que cuatro se rellenan con la última conocida.
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: 16, msec: 20, adelante: 1 }] });
    assert.equal(c.perdidas, 14);
    assert.equal(c.abandonadas, 0);
    // Y con treinta perdidas se abandona la ráfaga entera.
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: 50, msec: 20, adelante: 1 }] });
    assert.ok(c.abandonadas >= 24);
  });

  await t.test("la foto sólo lleva lo que ha cambiado, y contra la foto RECONOCIDA", async () => {
    const { partida } = await partidaLista();
    const { c: uno } = await jugadorDentro(partida, "Uno");
    const { c: dos } = await jugadorDentro(partida, "Dos");
    const a = partida.foto(uno);
    assert.equal(a.completa, true);
    assert.equal(a.jugadores.length, 2);
    // Sin reconocer la primera, la segunda vuelve a ir completa: el servidor
    // no da por recibido lo que no le han acusado.
    assert.equal(partida.foto(uno).completa, true);
    uno.fotoReconocida = 2;
    const c3 = partida.foto(uno);
    assert.equal(c3.completa, false);
    // Nadie se ha movido, así que sólo viaja UNO: **el propio jugador, que va
    // siempre**. Sin esa excepción, un cliente quieto no recibe su propio
    // estado y no tiene contra qué reconciliar si su predicción se equivoca —
    // lo cazó la sonda: se le teletransportaba dos metros y el servidor callaba.
    assert.deepEqual(c3.jugadores.map((j) => j.id), [uno.id]);
    // Que se mueva uno y sólo va ése.
    await partida.recibir(dos.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: 1, msec: 40, adelante: 1 }] });
    uno.fotoReconocida = 3;
    const c4 = partida.foto(uno);
    // El que se movió, y uno mismo — que va siempre.
    assert.deepEqual(c4.jugadores.map((j) => j.id).sort(), [uno.id, dos.id].sort());
  });

  await t.test("quien se va sale en la foto y suelta su cuerpo", async () => {
    const { partida, mundo } = await partidaLista();
    const { c: uno } = await jugadorDentro(partida, "Uno");
    const { c: dos } = await jugadorDentro(partida, "Dos");
    partida.foto(uno);
    uno.fotoReconocida = 1;
    const cuerpos = mundo.world.world.bodies.len();
    await partida.desconectar(dos.id);
    assert.ok(mundo.world.world.bodies.len() < cuerpos, "la cápsula del que se fue ya no choca");
    const f = partida.foto(uno);
    assert.deepEqual(f.fuera, [dos.id]);
  });

  await t.test("al desconectar se GUARDA el personaje (ClientDisconnected)", async () => {
    const { partida, almacen } = await partidaLista();
    const { c, id } = await jugadorDentro(partida, "Guardado");
    c.sesion.personaje.oro = 4242;
    c.sesion.tocado();
    await partida.desconectar(c.id);
    const enDisco = (await almacen.leer(id)).personaje;
    assert.equal(enDisco.oro, 4242);
  });

  await t.test("los huecos: el más bajo libre, y 32 es 32", async () => {
    const { partida } = await partidaLista();
    const cs = [];
    for (let i = 0; i < RED.maxJugadores; i++) cs.push(partida.conectar(buzon()));
    assert.equal(cs[0].id, 1);
    assert.equal(cs[31].id, 32);
    assert.equal(partida.conectar(buzon()), null, "el 33 no entra");
    await partida.desconectar(7);
    assert.equal(partida.conectar(buzon()).id, 7, "y el siguiente coge el hueco libre más bajo");
  });

  await t.test("rebobinar devuelve dónde ESTABA, no dónde está", async () => {
    const { partida } = await partidaLista();
    const { c: uno } = await jugadorDentro(partida, "Uno");
    const { c: dos } = await jugadorDentro(partida, "Dos");
    for (let i = 1; i <= 25; i++) {
      await partida.recibir(dos.id, { t: MENSAJE.ORDENES, ordenes: [{ seq: i, msec: 20, adelante: 1 }] });
      partida.avanzar(0.02);
    }
    const ahora = dos.cuerpo.feet;
    const antes = partida.rebobinar(partida.t - 0.2, { salvo: uno.id }).get(dos.id);
    assert.ok(antes, "hay historia");
    const atras = Math.hypot(ahora[0] - antes.pies[0], ahora[2] - antes.pies[2]);
    assert.ok(atras > 0.3, `en 0,2 s se había movido ${atras.toFixed(2)} m`);
    // Y el instante al que se rebobina para un cliente con 80 ms de retardo
    // sale de `tiempoObjetivo`, no de una constante.
    uno.latencia = 0.08;
    uno.lerpMsec = 100;
    assert.ok(partida.objetivoDe(uno.id) < partida.t - 0.17);
  });
});

// ── 4. EL CLIENTE: predecir y reconciliar ──────────────────────────────────

/**
 * Un cable de mentira, con dos cosas que un cable de verdad tiene y que en
 * `localhost` no se ven nunca: **retardo y pérdidas**. Sin poder provocarlas,
 * la reconciliación no se puede comprobar — en local siempre acierta.
 */
function cable({ retraso = 0, pierde = () => false } = {}) {
  const cola = [];
  const lado = () => {
    const oyentes = new Set();
    return {
      oyentes,
      al: (ev, fn) => { if (ev === "mensaje") oyentes.add(fn); return () => oyentes.delete(fn); },
    };
  };
  const a = lado();
  const b = lado();
  let t = 0;
  const mandar = (destino, texto) => {
    if (pierde(texto)) return;
    cola.push({ cuando: t + retraso, destino, texto });
  };
  a.enviar = (texto) => mandar(b, texto);
  b.enviar = (texto) => mandar(a, texto);
  return {
    a, b,
    /** Avanza el cable: entrega lo que ya haya llegado. */
    correr(dt = 0) {
      t += dt;
      for (const paquete of cola.filter((p) => p.cuando <= t)) {
        for (const fn of paquete.destino.oyentes) fn(paquete.texto);
      }
      cola.splice(0, cola.length, ...cola.filter((p) => p.cuando > t));
    },
  };
}

/** Una partida y un cliente unidos por un cable, cada uno con su mundo. */
async function enfrentados({ retraso = 0, pierde = () => false } = {}) {
  const mundoServidor = await mundoLiso();
  const mundoCliente = await mundoLiso();
  const almacen = new AlmacenMemoria();
  const partida = new Partida({ mundo: mundoServidor, almacen, aparicion: APARICION });
  const cab = cable({ retraso, pierde });
  const servidorVe = partida.conectar(cab.b);
  cab.b.al("mensaje", (texto) => partida.recibir(servidorVe.id, JSON.parse(texto)));
  const cuerpo = mundoCliente.crearCuerpo([0, 0.2, 0]);
  const cliente = new ClienteDeRed({ enlace: cab.a, cuerpo, ahora: () => partida.t });
  return { partida, cliente, cuerpo, cab, servidorVe, almacen, mundoCliente };
}

test("el cliente predice, y cuando falla manda el servidor", async (t) => {
  await t.test("predecir: el cuerpo se mueve en el acto, sin esperar respuesta", async () => {
    const { cliente, cuerpo, cab } = await enfrentados({ retraso: 0.5 });
    cliente.dentro = true;
    const antes = [...cuerpo.feet];
    for (let i = 0; i < 30; i++) cliente.paso(1 / 60, { adelante: 1, msec: 16 });
    const anduvo = Math.hypot(cuerpo.feet[0] - antes[0], cuerpo.feet[2] - antes[2]);
    assert.ok(anduvo > 0.5, `anduvo ${anduvo.toFixed(2)} m con el servidor a medio segundo`);
    assert.equal(cliente.fotosRecibidas, 0, "y sin haber recibido una sola foto");
    cab.correr(0);
  });

  await t.test("los milisegundos que se pierden al redondear se guardan", () => {
    // A 60 fotogramas por segundo cada uno dura 16,67 ms y el `msec` es un
    // byte: sin guardar el resto se pierde un 4 % de velocidad, que es una
    // separación lenta e invisible entre el cliente y el servidor.
    const c = new ClienteDeRed({ enlace: { enviar() {}, al: () => () => {} } });
    c.dentro = true;
    let suma = 0;
    for (let i = 0; i < 60; i++) { const o = c.paso(1 / 60, {}); if (o) suma += o.msec; }
    assert.ok(Math.abs(suma - 1000) <= 1, `un segundo de órdenes son ${suma} ms`);
  });

  await t.test("el respaldo: cada paquete repite las diez anteriores", async () => {
    const { cliente } = await enfrentados();
    cliente.dentro = true;
    let mandado = 0;
    cliente.enlace.enviar = (texto) => { const m = JSON.parse(texto); if (m.t === MENSAJE.ORDENES) mandado = m.ordenes.length; };
    for (let i = 0; i < 40; i++) { cliente.paso(1 / 60, { adelante: 1 }); cliente.enviar(); }
    assert.equal(mandado, RED.cmdbackup + 1);
  });

  await t.test("reconciliar: el servidor corrige y se REHACEN las pendientes", async () => {
    const { partida, cliente, cuerpo, cab, servidorVe } = await enfrentados({ retraso: 0.1 });
    // Entrar de verdad, por el protocolo.
    cliente.hola({ nombre: "Uno" });
    cab.correr(0.1);
    await partida.recibir(servidorVe.id, { t: MENSAJE.CREAR, personaje: { nombre: "Uno" } });
    const lista = await partida.almacen.listar();
    await partida.recibir(servidorVe.id, { t: MENSAJE.ELEGIR, id: lista[0].id });
    cab.correr(0.1);
    assert.equal(cliente.dentro, true, "el servidor le ha dado cuerpo");
    cliente.cuerpo.colocar(servidorVe.cuerpo.feet);

    // Se le miente al cliente: se le teletransporta un metro. Es lo que haría
    // una predicción equivocada —o un tramposo—, y el servidor no lo sabe.
    const pies = cuerpo.feet;
    cuerpo.colocar([pies[0] + 1, pies[1], pies[2]]);

    for (let i = 0; i < 40; i++) {
      cliente.paso(1 / 60, { adelante: 1 });
      cab.correr(1 / 60);
      partida.avanzar(1 / 60);
      partida.repartir();
      cab.correr(0);
    }
    // Lo último que se haya pulsado se manda: si no, quedan hasta dos órdenes
    // sin salir —el cliente manda a 30/s y produce a 60— y eso son 13 cm de
    // diferencia que no es deriva, es correo pendiente.
    cliente.enviar();
    cab.correr(0.2);
    assert.ok(cliente.correcciones > 0, "ha habido corrección");
    const separados = Math.hypot(
      cuerpo.feet[0] - servidorVe.cuerpo.feet[0],
      cuerpo.feet[2] - servidorVe.cuerpo.feet[2]
    );
    assert.ok(separados < 0.05, `tras corregir quedan ${(separados * 100).toFixed(1)} cm`);
  });

  await t.test("y sin mentiras la predicción acierta: ni una corrección", async () => {
    const { partida, cliente, cuerpo, cab, servidorVe } = await enfrentados({ retraso: 0.05 });
    const lista = await preparar(partida, cliente, cab, servidorVe);
    assert.ok(lista);
    cliente.cuerpo.colocar(servidorVe.cuerpo.feet);
    for (let i = 0; i < 120; i++) {
      cliente.paso(1 / 60, { adelante: 1, yaw: 0.3 });
      cab.correr(1 / 60);
      partida.avanzar(1 / 60);
      partida.repartir();
      cab.correr(0);
    }
    cliente.enviar();
    cab.correr(0.2);
    assert.ok(cliente.fotosRecibidas > 5, `${cliente.fotosRecibidas} fotos`);
    // La misma física en los dos lados, con las mismas órdenes, da el mismo
    // sitio. Si esto falla, es que hay dos físicas.
    assert.ok(cliente.errorMaximo < 0.02, `el error máximo fue de ${(cliente.errorMaximo * 1000).toFixed(1)} mm`);
    const separados = Math.hypot(
      cuerpo.feet[0] - servidorVe.cuerpo.feet[0],
      cuerpo.feet[2] - servidorVe.cuerpo.feet[2]
    );
    assert.ok(separados < 0.05, `y acaban a ${(separados * 100).toFixed(1)} cm`);
  });

  await t.test("interpolar: a los demás se les dibuja en el pasado", () => {
    let reloj = 100;
    const c = new ClienteDeRed({ enlace: { enviar() {}, al: () => () => {} }, ahora: () => reloj });
    c.yo = 1;
    // Tres fotos separadas 50 ms, con el otro andando un metro entre cada dos.
    // Hacen falta TRES y no dos, y esto es la ventana de interpolación medida:
    // con `ex_interp` de 100 ms y fotos cada 50, el instante que se dibuja cae
    // dos fotos por detrás de la última. Con sólo dos fotos en la cola no hay
    // nada que interpolar todavía — se dibuja la más vieja y se espera.
    const foto = (seq, tiempo, x) => empaquetar(MENSAJE.FOTO, {
      seq, tiempo, ack: 0, jugadores: [{ id: 2, pies: [x, 0, 0], yaw: 0 }], fuera: [],
    });
    c.recibir(foto(1, 10.0, 0));
    reloj = 100.05; c.recibir(foto(2, 10.05, 1));
    // Justo aquí, el instante a dibujar es 10,05 − 0,1 = 9,95: antes de la
    // primera foto. Se queda en la primera y NO adivina.
    assert.equal(c.interpolados().get(2).pies[0], 0);
    assert.equal(c.interpolados().get(2).interpolado, false);

    reloj = 100.1; c.recibir(foto(3, 10.1, 2));
    reloj = 100.12;
    const otro = c.interpolados().get(2);
    assert.ok(otro.interpolado, "ahora sí interpola entre dos fotos");
    // 10,1 + 0,02 − 0,1 = 10,02, que está al 40 % del camino de la primera a la
    // segunda: x = 0,4. Y el otro jugador está de verdad en 2 — o sea que se le
    // dibuja **1,6 m por detrás**, que es lo que cuesta no dar saltos.
    assert.ok(Math.abs(otro.pies[0] - 0.4) < 0.05, `va por ${otro.pies[0].toFixed(2)}`);

    // Y pasado el final tampoco extrapola: se queda en la última conocida.
    reloj = 101;
    assert.equal(c.interpolados().get(2).pies[0], 2);
    assert.equal(c.interpolados().get(2).interpolado, false);
  });

  await t.test("un jugador que se va desaparece de los interpolados", () => {
    const c = new ClienteDeRed({ enlace: { enviar() {}, al: () => () => {} } });
    c.yo = 1;
    c.recibir(empaquetar(MENSAJE.FOTO, { seq: 1, tiempo: 1, ack: 0, jugadores: [{ id: 2, pies: [0, 0, 0], yaw: 0 }], fuera: [] }));
    assert.equal(c.interpolados().size, 1);
    c.recibir(empaquetar(MENSAJE.FOTO, { seq: 2, tiempo: 1.05, ack: 0, jugadores: [], fuera: [2] }));
    assert.equal(c.interpolados().size, 0);
  });

  await t.test("el almacén remoto: listar va y vuelve, y escribir NO manda el personaje", async () => {
    const { partida, cliente, cab, servidorVe } = await enfrentados();
    const almacen = new AlmacenRemoto(cliente, { espera: 1000 });
    const promesa = almacen.listar();
    cab.correr(0);
    await partida.recibir(servidorVe.id, { t: MENSAJE.PERSONAJES });
    cab.correr(0);
    assert.deepEqual(await promesa, []);

    // Crear: lo que sale por el cable son TRES campos, no un personaje.
    const salido = [];
    const antes = cliente.enlace.enviar;
    cliente.enlace.enviar = (t) => { salido.push(JSON.parse(t)); antes(t); };
    const creando = almacen.escribir({
      id: "local-1", nombre: "Nueva", genero: "female",
      manos: { derecha: "swords_rsword" },
      // Y esto es lo que un tramposo metería aquí:
      habilidades: { swordsmanship: 100 }, oro: 999999,
    });
    cab.correr(0);
    await partida.recibir(servidorVe.id, salido.find((m) => m.t === MENSAJE.CREAR));
    cab.correr(0);
    const doc = await creando;
    const pedido = salido.find((m) => m.t === MENSAJE.CREAR).personaje;
    assert.deepEqual(Object.keys(pedido).sort(), ["arma", "genero", "nombre"]);
    // El id es el del SERVIDOR, no el que traía.
    assert.ok(doc.id && doc.id !== "local-1", `id ${doc.id}`);
    const enDisco = (await partida.almacen.leer(doc.id)).personaje;
    assert.equal(enDisco.nombre, "Nueva");
    assert.equal(enDisco.oro, 10, "el oro lo pone el servidor, no el mensaje");
    // Las habilidades son las de salida —el `power` a uno y lo demás a cero,
    // que es `habilidadesDePartida()`— y no el 100 que pedía el mensaje.
    assert.equal(enDisco.habilidades.swordsmanship.power.valor, 1);
    assert.equal(enDisco.habilidades.swordsmanship.proficiency.valor, 0);

    // Y el autoguardado de uno que ya existe no manda NADA: guarda el servidor.
    salido.length = 0;
    const otra = await almacen.escribir(enDisco);
    assert.equal(salido.length, 0);
    assert.equal(otra.id, enDisco.id);
  });
});

/** Entrar por el protocolo, que se repite en varias pruebas. */
async function preparar(partida, cliente, cab, servidorVe, nombre = "Uno") {
  cliente.hola({ nombre });
  cab.correr(0.05);
  await partida.recibir(servidorVe.id, { t: MENSAJE.CREAR, personaje: { nombre } });
  const lista = await partida.almacen.listar();
  await partida.recibir(servidorVe.id, { t: MENSAJE.ELEGIR, id: lista[0].id });
  cab.correr(0.05);
  return lista[0].id;
}

// ── 5. Y UNA VUELTA POR UN SOCKET DE VERDAD ────────────────────────────────

test("el socket, con TCP de por medio", async (t) => {
  await t.test("apretón, ida y vuelta, mensaje grande y cierre", async () => {
    const { http, ws, puerto } = await servir({ ruta: "/juego" });
    const recibidos = [];
    ws.al("conexion", (c) => {
      c.al("mensaje", (texto) => { recibidos.push(texto); c.enviar(`eco:${texto.length}`); });
    });
    const cliente = await conectar(`ws://127.0.0.1:${puerto}/juego`);
    const respuestas = [];
    cliente.al("mensaje", (m) => respuestas.push(m));
    cliente.enviar("hola");
    // Uno grande, que pasa por el largo de dos bytes y por varios `data`.
    cliente.enviar("x".repeat(100000));
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(recibidos.map((r) => r.length), [4, 100000]);
    assert.deepEqual(respuestas, ["eco:4", "eco:100000"]);
    const cerrado = new Promise((r) => cliente.al("cierre", r));
    cliente.cerrar(1000, "hasta luego");
    await cerrado;
    assert.equal(cliente.abierta, false);
    http.closeAllConnections?.();
    http.close();
  });

  await t.test("una petición que no es un WebSocket no cuela", async () => {
    const { http, puerto } = await servir({ ruta: "/juego" });
    const r = await fetch(`http://127.0.0.1:${puerto}/juego`).catch(() => null);
    assert.equal(r?.status, 404, "el HTTP normal no lo atiende el WebSocket");
    // Y una ruta que no es la suya se rechaza en el apretón.
    await assert.rejects(conectar(`ws://127.0.0.1:${puerto}/otra`));
    http.closeAllConnections?.();
    http.close();
  });
});

test("una partida entera por un socket de verdad", async () => {
  const { Anfitrion } = await import("../src/red/anfitrion.js");
  const mundo = await mundoLiso();
  const almacen = new AlmacenMemoria();
  const partida = new Partida({ mundo, almacen, aparicion: APARICION, nombre: "de prueba" });
  const { http, ws, puerto } = await servir({ ruta: "/juego" });
  const anfitrion = new Anfitrion({ partida, ws }).arrancar({ cada: 5 });
  // EL 98: el servidor se cierra en un `finally`. Si una aserción de en medio
  // fallaba, el HTTP y el reloj del anfitrión quedaban abiertos y `npm test`
  // no terminaba nunca: un rojo convertido en un cuelgue (aviso del integrador).
  let enlace = null;
  try {

  const mundoCliente = await mundoLiso();
  enlace = await conectar(`ws://127.0.0.1:${puerto}/juego`);
  const cuerpo = mundoCliente.crearCuerpo([0, 0.2, 0]);
  const cliente = new ClienteDeRed({ enlace, cuerpo });
  const bienvenido = new Promise((r) => cliente.al("bienvenida", r));
  cliente.hola({ nombre: "Sonda" });
  await bienvenido;

  const conLista = new Promise((r) => cliente.al("lista", r));
  cliente.crear({ nombre: "Sonda" });
  // El suceso lleva el mensaje entero: la lista y **cuál se acaba de crear**,
  // porque el identificador lo pone el servidor.
  const { personajes, creado } = await conLista;
  assert.equal(personajes.length, 1);
  const apareces = new Promise((r) => cliente.al("apareces", r));
  cliente.elegir(creado);
  const m = await apareces;
  assert.equal(m.personaje.nombre, "Sonda");

  cuerpo.colocar(m.donde.escena);
  // EL 98: 54 pasos de 1/60 s CONTADOS, no «lo que quepa en 900 ms de
  // reloj de pared». El juego avanza lo que se le manda (`msec`), y con la
  // máquina cargada —`npm test` corre los archivos en paralelo, y había cinco
  // sesiones a la vez— un `setTimeout(16)` tardaba tanto que en 900 ms sólo
  // cabían unos pocos pasos y «le ha movido de verdad» (> 1 m) salía rojo con
  // el juego bien. Medía la carga, no el servidor (el 97 ya lo sospechaba,
  // doc/ATURDIR_97.md §3). Contados, son 0,9 s de juego pase lo que pase.
  for (let k = 0; k < 54; k++) {
    cliente.paso(1 / 60, { adelante: 1 });
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(cliente.fotosRecibidas > 5, `${cliente.fotosRecibidas} fotos en un segundo`);
  assert.ok(cliente.latencia >= 0);
  const suyo = partida.clientes.get(1).cuerpo.feet;
  const separados = Math.hypot(cuerpo.feet[0] - suyo[0], cuerpo.feet[2] - suyo[2]);
  assert.ok(separados < 0.2, `cliente y servidor a ${(separados * 100).toFixed(1)} cm`);
  assert.ok(Math.hypot(suyo[0], suyo[2]) > 1, "y el servidor le ha movido de verdad");

  enlace.cerrar(1000, "fin");
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(partida.clientes.size, 0, "el servidor se entera de que se fue");
  } finally {
    try { enlace?.cerrar?.(1000, "fin"); } catch {}
    anfitrion.parar();
    http.closeAllConnections?.();
    http.close();
  }
});
