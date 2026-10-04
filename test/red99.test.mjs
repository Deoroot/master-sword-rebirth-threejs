// EL 99, PIEZA Q: LA PREDICCIÓN ANDA LO QUE ANDA EL SERVIDOR, Y `givehp` EN UN NPC.
//
// 1. Con servidor, el navegador rehacía las órdenes pendientes con el 160 del
//    perfil (`o.maxima`, que ninguna orden trae): quien anda a 184 corregía en
//    CADA foto (73 correcciones en 3 s, sondas/red99.mjs). En el motor la
//    velocidad va dentro del `usercmd` (`CheckSpeed` la escribe en
//    `cl_forwardspeed`, clplayer.cpp:306-316, y `CL_CreateMove` la mete en
//    `forwardmove`, input.cpp:795-796), así que rehacer usa la de la orden.
//    Ahora `ClienteDeRed` guarda la velocidad con que se corrió cada orden y
//    se la da al gancho `simular` al rehacerla.
//
//    TODO ENTRA POR UNA `Partida` DE VERDAD (CLAUDE.md §4, el 59): personajes en
//    su almacén, elegidos con `MENSAJE.ELEGIR`, órdenes por el cable y fotos de
//    vuelta. El gancho `simular` de abajo es una COPIA del de `src/main.js`
//    (no se puede importar: vive dentro del arranque del navegador); por eso el
//    efecto en el navegador lo mide además sondas/red99.mjs.
//
// 2. `givehp` de un NPC reventaba con «e.dar is not a function»: el entorno de
//    un NPC no tenía el gancho. Se prueba con el guion DEL MOD
//    (skeleton_poison_random.script:298-305), mordiendo por la manada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Partida } from "../src/red/partida.js";
import { ClienteDeRed } from "../src/red/cliente.js";
import { mundoLiso } from "../src/red/liso.js";
import { vitalesDe, correrOrden } from "../src/red/andar.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, BOTON } from "../src/red/protocolo.js";
import { servir, conectar } from "../src/red/socket.js";
import { crearPersonaje } from "../src/juego/personaje.js";
import { velocidadAndando } from "../src/play/movimiento.js";
import { fabricar } from "../tools/personaje.mjs";
import { leerFichaNpc, modeloYAnimaciones, RELACION } from "../src/bsp/script.js";
import { Manada } from "../src/play/manada.js";
import { InteraccionesNpc } from "../src/juego/interacciones.js";
import { cargarGuion } from "../tools/scriptsmsr.mjs";
import { partirGuion } from "../src/play/guion.js";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const comun = (n) => join(RAIZ, "build/msr", n);
const NECESARIOS = ["objetos.json", "objetosguion.json", "jugador.json", "efectosguion.json"];
const faltan = NECESARIOS.filter((n) => !existsSync(comun(n)));
const SALTA = faltan.length ? `sin ${faltan.join(", ")}` : false;
const SCRIPTS = join(RAIZ, "../MSC/MSCScripts/scripts");
const HAY_MOD = existsSync(join(SCRIPTS, "monsters/skeleton_poison_random.script"));
const leer = (n) => JSON.parse(readFileSync(comun(n), "utf8"));
const H = SALTA ? null : {
  catalogo: leer("objetos.json"), objetosGuion: leer("objetosguion.json"),
  fichaDelJugador: leer("jugador.json"), efectos: leer("efectosguion.json"),
};
const DT = 1 / 60;

/** Un cable en memoria con retraso, como el de test/red_27.test.mjs. */
function cable({ retraso = 0 } = {}) {
  const cola = [];
  const lado = () => {
    const oyentes = new Set();
    return { oyentes, al: (ev, fn) => { if (ev === "mensaje") oyentes.add(fn); return () => oyentes.delete(fn); } };
  };
  const a = lado(), b = lado();
  let t = 0;
  a.enviar = (texto) => cola.push({ cuando: t + retraso, destino: b, texto });
  b.enviar = (texto) => cola.push({ cuando: t + retraso, destino: a, texto });
  return {
    a, b,
    correr(dt = 0) {
      t += dt;
      const listos = cola.filter((p) => p.cuando <= t);
      cola.splice(0, cola.length, ...cola.filter((p) => p.cuando > t));
      for (const p of listos) for (const fn of p.destino.oyentes) fn(p.texto);
    },
  };
}

/** Veteran tal cual (anda a 184) o débil, sin nada puesto y con la misma mochila (anda a 91,3). */
function personajeDe(quien) {
  const p = fabricar({ nombre: quien === "rapido" ? "Ana" : "Beto" });
  if (quien === "lento") {
    p.habilidades = crearPersonaje({ nombre: "x" }).habilidades;
    p.objetos = p.objetos.map(({ puesto, ...o }) => o);
  }
  return p;
}

/**
 * EL GANCHO `simular` DE src/main.js, copiado (`red.simular`): rehace la orden
 * con la velocidad que le da el cliente. `viejo` es el de antes del 99, que
 * leía `o.maxima` —nunca viene— y caía en el `maxima` del cuerpo.
 */
const simularComoMain = ({ viejo = false } = {}) => (cuerpo, o, v = null) => {
  cuerpo.yaw = o.yaw;
  cuerpo.pitch = o.cabeceo;
  cuerpo.step(o.msec / 1000, {
    forward: o.adelante, strafe: o.lado,
    jump: (o.botones & BOTON.SALTAR) !== 0, agachar: (o.botones & BOTON.AGACHAR) !== 0,
    maxima: viejo ? (o.maxima ?? undefined) : (v?.maxima ?? undefined),
    tope: viejo ? Infinity : (v?.tope ?? Infinity),
  });
};

/**
 * Una `Partida` de verdad y un `ClienteDeRed` unidos por el cable, con el
 * personaje dado ya dentro. `navegador` decide cómo predice el cliente:
 *   - `null`: el cliente de Node (`paso`, que corre `correrOrden`);
 *   - `"nuevo"`/`"viejo"`: como src/main.js — el bucle corre la orden con la
 *     velocidad del personaje y `apuntar` la registra; rehacer es `simular`.
 */
async function enRed(quien, { navegador = null, retraso = 0.05 } = {}) {
  const mundo = await mundoLiso();
  const almacen = new AlmacenMemoria();
  const p = personajeDe(quien);
  await almacen.escribir(p);
  const partida = new Partida({
    mundo, almacen, ahora: () => 0, catalogo: H.catalogo,
    objetosGuion: H.objetosGuion, fichaDelJugador: H.fichaDelJugador, efectos: H.efectos,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.2, 0] } },
  });
  const cab = cable({ retraso });
  const sv = partida.conectar(cab.b, { nombre: p.nombre });
  cab.b.al("mensaje", (texto) => partida.recibir(sv.id, JSON.parse(texto)));
  const mundoCliente = await mundoLiso();
  const cuerpo = mundoCliente.crearCuerpo([0, 0.2, 0]);
  const cliente = new ClienteDeRed({
    enlace: cab.a, cuerpo, ahora: () => partida.t,
    simular: navegador ? simularComoMain({ viejo: navegador === "viejo" }) : null,
  });
  cliente.porId = partida._porId;
  cliente.hola({ nombre: p.nombre });
  cab.correr(retraso);
  cliente.elegir(p.id);
  cab.correr(retraso); await new Promise((r) => setImmediate(r)); cab.correr(retraso);
  assert.equal(cliente.dentro, true, "el servidor le ha dado cuerpo");
  cuerpo.colocar(sv.cuerpo.feet);
  const vit = vitalesDe(cliente.personaje, cliente.porId);
  /** Un fotograma del navegador o del cliente de Node, y el mundo detrás. */
  const fotograma = () => {
    if (navegador) {
      const ms = cliente.msecDe(DT);
      if (ms > 0) {
        // El bucle de src/main.js: la velocidad del personaje (`velocidadAndando`
        // de sus vitales, sin trotar) y el paso, y luego `apuntar` con ella.
        const maxima = velocidadAndando(vit);
        cuerpo.yaw = 0; cuerpo.pitch = 0;
        cuerpo.step(ms / 1000, { forward: 1, strafe: 0, maxima, tope: Infinity });
        cliente.apuntar({ msec: ms, yaw: 0, cabeceo: 0, adelante: 1, lado: 0, botones: 0 },
          { velocidad: { maxima, tope: Infinity } });
      }
    } else {
      cliente.paso(DT, { adelante: 1, yaw: 0 });
    }
    cab.correr(DT);
    partida.avanzar(DT);
    partida.repartir();
    cab.correr(0);
  };
  return { partida, cliente, cuerpo, sv, fotograma, vit };
}

/**
 * Anda dos segundos desde parado y cuenta. La PRIMERA foto corrige siempre
 * (aún no hay nada predicho para su `ack`, `_reconciliar`), y esa corrección
 * rehace las pendientes: es exactamente lo que pasa al entrar en la partida, y
 * lo que en la sonda dejaba a Red99b corrigiendo 73 veces en 3 s.
 */
function andarDosSegundos(r) {
  for (let k = 0; k < 120; k++) r.fotograma();
  return {
    correcciones: r.cliente.correcciones, errorMaximo: r.cliente.errorMaximo,
    servidor: r.sv.cuerpo.rapidez, prediccion: r.cuerpo.rapidez,
  };
}

test("1. el navegador rehace las órdenes con la velocidad con que las corrió", { skip: SALTA }, async (t) => {
  await t.test("los dos personajes andan a velocidades distintas según el servidor (el caso que separa)", async () => {
    const rapido = await enRed("rapido");
    const lento = await enRed("lento");
    for (let k = 0; k < 60; k++) { rapido.fotograma(); lento.fotograma(); }
    assert.ok(Math.abs(rapido.sv.cuerpo.rapidez - 184) < 1, `Ana ${rapido.sv.cuerpo.rapidez}`);
    assert.ok(Math.abs(lento.sv.cuerpo.rapidez - 91.33) < 1, `Beto ${lento.sv.cuerpo.rapidez}`);
  });

  for (const quien of ["rapido", "lento"]) {
    await t.test(`${quien}: la corrección de entrada se rehace bien y no vuelve a corregir`, async () => {
      const r = andarDosSegundos(await enRed(quien, { navegador: "nuevo" }));
      assert.equal(r.correcciones, 1, `${r.correcciones} correcciones (la de entrada y ninguna más)`);
      assert.ok(r.errorMaximo < 0.001, `error máximo ${(r.errorMaximo * 1000).toFixed(2)} mm`);
      assert.ok(Math.abs(r.prediccion - r.servidor) < 0.5, `predicción ${r.prediccion} contra ${r.servidor}`);
    });
    await t.test(`${quien}, CONTROL POSITIVO: con el gancho de antes del 99, cada foto corrige`, async () => {
      const r = andarDosSegundos(await enRed(quien, { navegador: "viejo" }));
      assert.ok(r.correcciones >= 20, `${r.correcciones} correcciones con el gancho viejo`);
      assert.ok(r.errorMaximo > 0.01, `error máximo ${(r.errorMaximo * 1000).toFixed(2)} mm`);
    });
  }

  await t.test("lo guardado se suelta con el `ack`: no crece con la partida", async () => {
    const r = await enRed("rapido", { navegador: "nuevo" });
    for (let k = 0; k < 300; k++) r.fotograma();
    assert.ok(r.cliente.velocidades.size <= r.cliente.pendientes.length + 1,
      `${r.cliente.velocidades.size} guardadas para ${r.cliente.pendientes.length} pendientes`);
    // Y cada pendiente tiene la suya: es lo que `simular` recibe al rehacer.
    for (const o of r.cliente.pendientes) assert.ok(r.cliente.velocidades.has(o.seq), `la ${o.seq} sin velocidad`);
  });
});

test("2. el cliente de Node predice con la misma cuenta que el servidor, trabas incluidas", { skip: SALTA }, async (t) => {
  await t.test("`correrOrden` da lo mismo que `Partida._simular` deja en `c.maxima`", async () => {
    const r = await enRed("rapido");
    for (let k = 0; k < 60; k++) r.fotograma();
    assert.ok(Math.abs(r.cliente.maxima - r.sv.maxima) < 1e-9, `${r.cliente.maxima} contra ${r.sv.maxima}`);
    // Y la pura: con una orden de trotar, trabada por NORUN, no trota.
    const estado = { corriendo: false, aguante: 0, rapidezAnterior: 0 };
    const o = { adelante: 1, lado: 0, botones: BOTON.CORRER };
    const libre = correrOrden({ ...estado }, o, { dt: DT, vitales: r.vit });
    const trabado = correrOrden({ ...estado }, o, { dt: DT, vitales: r.vit, trabas: { noCorrer: true, porcentaje: 0 } });
    assert.ok(libre.maxima > trabado.maxima * 1.5, `${libre.maxima} libre, ${trabado.maxima} trabado`);
  });

  await t.test("ATURDIDO (45 u/s en el servidor): el cliente predice el tope que trae la foto", async () => {
    const r = await enRed("rapido");
    for (const o of r.sv.sesion.personaje.objetos) delete o.puesto;   // sin yelmo no se resiste
    r.partida._efectosDe(r.sv).efectos.aplicar("effects/debuff_stun", ["3", "0"]);
    // Un segundo para que la traba llegue (va en la foto, con su latencia) y
    // la rapidez se asiente, y se mide el segundo de después.
    for (let k = 0; k < 60; k++) r.fotograma();
    r.cliente.errorMaximo = 0;
    for (let k = 0; k < 60; k++) r.fotograma();
    assert.ok(r.sv.cuerpo.rapidez > 40 && r.sv.cuerpo.rapidez < 45.5, `servidor ${r.sv.cuerpo.rapidez}`);
    assert.ok(r.cliente.trabas?.porcentaje > 0, "las trabas llegan en la foto");
    assert.ok(Math.abs(r.cliente.maxima - r.sv.maxima) < 1e-9, `maxima ${r.cliente.maxima} contra ${r.sv.maxima}`);
    assert.ok(Math.abs(r.cuerpo.rapidez - r.sv.cuerpo.rapidez) < 0.5, `predicción ${r.cuerpo.rapidez}`);
    // Las correcciones NO se cuentan aquí: tras una corrección en marcha el
    // error de redondeo de la foto (milímetros) ronda el umbral de 1 mm y
    // vuelve a corregir de vez en cuando — pendiente, doc/RED_99.md §4.
    assert.ok(r.cliente.errorMaximo < 0.01, `error ${(r.cliente.errorMaximo * 1000).toFixed(2)} mm`);
  });

  await t.test("CONTROL POSITIVO: si el cliente no leyera las trabas de la foto, corregiría sin parar", async () => {
    const r = await enRed("rapido");
    r.cliente.al("foto", () => { r.cliente.trabas = null; });
    for (const o of r.sv.sesion.personaje.objetos) delete o.puesto;
    r.partida._efectosDe(r.sv).efectos.aplicar("effects/debuff_stun", ["3", "0"]);
    for (let k = 0; k < 60; k++) r.fotograma();
    r.cliente.errorMaximo = 0;
    const c0 = r.cliente.correcciones;
    for (let k = 0; k < 60; k++) r.fotograma();
    assert.ok(r.cliente.correcciones - c0 >= 10, `${r.cliente.correcciones - c0} correcciones`);
    assert.ok(r.cliente.errorMaximo > 0.02, `error ${(r.cliente.errorMaximo * 1000).toFixed(2)} mm`);
  });
});

test("3. por un socket de verdad: el rápido no corrige", { skip: SALTA }, async () => {
  const { Anfitrion } = await import("../src/red/anfitrion.js");
  const mundo = await mundoLiso();
  const almacen = new AlmacenMemoria();
  const p = personajeDe("rapido");
  await almacen.escribir(p);
  const partida = new Partida({
    mundo, almacen, catalogo: H.catalogo, objetosGuion: H.objetosGuion,
    fichaDelJugador: H.fichaDelJugador, efectos: H.efectos,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.2, 0] } },
  });
  const { http, ws, puerto } = await servir({ ruta: "/juego" });
  const anfitrion = new Anfitrion({ partida, ws }).arrancar({ cada: 5 });
  let enlace = null;
  try {
    const mundoCliente = await mundoLiso();
    enlace = await conectar(`ws://127.0.0.1:${puerto}/juego`);
    const cuerpo = mundoCliente.crearCuerpo([0, 0.2, 0]);
    const cliente = new ClienteDeRed({ enlace, cuerpo, simular: simularComoMain() });
    const bienvenido = new Promise((r) => cliente.al("bienvenida", r));
    cliente.hola({ nombre: "Ana" });
    await bienvenido;
    const apareces = new Promise((r) => cliente.al("apareces", r));
    cliente.elegir(p.id);
    const m = await apareces;
    cuerpo.colocar(m.pies ?? m.donde.escena);
    const maxima = velocidadAndando(vitalesDe(m.personaje, partida._porId));
    assert.ok(Math.abs(maxima - 184) < 1, `Ana anda a ${maxima}`);
    // 90 pasos CONTADOS (el 98: no «lo que quepa» en un reloj de pared).
    for (let k = 0; k < 90; k++) {
      const ms = cliente.msecDe(DT);
      if (ms > 0) {
        cuerpo.yaw = 0;
        cuerpo.step(ms / 1000, { forward: 1, maxima, tope: Infinity });
        cliente.apuntar({ msec: ms, yaw: 0, cabeceo: 0, adelante: 1 }, { velocidad: { maxima, tope: Infinity } });
      }
      await new Promise((r) => setTimeout(r, 16));
    }
    cliente.enviar();
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(cliente.fotosRecibidas > 5, `${cliente.fotosRecibidas} fotos`);
    const suyo = [...partida.clientes.values()][0].cuerpo.feet;
    const separados = Math.hypot(cuerpo.feet[0] - suyo[0], cuerpo.feet[2] - suyo[2]);
    assert.ok(separados < 0.02, `cliente y servidor a ${(separados * 100).toFixed(2)} cm`);
    assert.ok(cliente.errorMaximo < 0.01, `error máximo ${(cliente.errorMaximo * 1000).toFixed(1)} mm`);
  } finally {
    try { enlace?.cerrar?.(1000, "fin"); } catch {}
    anfitrion.parar();
    http.closeAllConnections?.();
    http.close();
  }
});

// ── 4. `givehp` EN UN NPC ────────────────────────────────────────────────────

const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 15, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "run", fps: 30, fotogramas: 25, bucle: true, actividad: 4, pesoActividad: 1, avance: [76, 0, 0] },
  { indice: 3, nombre: "attack", fps: 30, fotogramas: 30, bucle: false, actividad: 28, pesoActividad: 1, avance: [0, 0, 0] },
  { indice: 4, nombre: "die", fps: 30, fotogramas: 40, bucle: false, actividad: 36, pesoActividad: 1, avance: [0, 0, 0] },
];
const U = 39.37;
function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** El esqueleto de gertenheld_forest2 y un jugador al alcance, con la costura enchufada como en el juego (test/costura91). */
function esqueleto({ hp = 350 } = {}) {
  const script = "monsters/skeleton_poison_random";
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, script));
  const manada = new Manada({
    mapa: "liso", unidadesPorMetro: U,
    razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_x", script, clave: "b",
      nombre: ficha.nombre ?? script, hp, ancho: ficha.ancho, alto: ficha.alto,
      parado: "idle1", andando: "walk", piel: 0, escena: [0, 0, 0], yaw: 0, luz: [0, 0, 0],
      hostil: true, relacion: RELACION.ODIO, ia: { ...ficha.ia, vida: hp },
    }],
  }, {
    secuenciasPorClave: new Map([["b", SECUENCIAS]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 72] }]]),
    azar: dado(5),
  });
  const personaje = { id: "P1", nombre: "Ana", vida: 100000 };
  const i = manada.instancias[0];
  const inter = new InteraccionesNpc({
    sesion: { personaje },
    guiones: { guiones: { [script]: cargarGuion(script) } },
    npcPorId: (id) => manada.de(id),
    suceso: () => {},
    losNpc: () => manada.instancias,
    dondeEstaElJugador: () => [i.donde[0] + 32 / U, i.donde[1], i.donde[2]],
    unidadesPorMetro: U,
  });
  inter.enchufarA(manada);
  const golpes = [];
  const arnes = {
    libre: () => true, suelo: () => 0, veA: () => true,
    objetivos: (x) => [{ id: "jugador", donde: [x.donde[0] * U + 32, x.donde[1] * U + 36, x.donde[2] * U], esJugador: true, relacion: RELACION.ODIO, ancho: 0 }],
    golpear: (_i, _id, dano) => { golpes.push(dano); return { parado: false, dano }; },
  };
  const correr = (s) => { for (let t = 0; t < s; t += DT) { manada.cazar(DT, arnes); inter.paso(DT); } };
  return { manada, inter, i, correr, golpes, g: () => inter.guionesVivos.get(i.id) ?? null };
}

test("4. `givehp` de un NPC: el vampiro se cura al morder, sin pasar del máximo y sin errores", { skip: !HAY_MOD }, async (t) => {
  await t.test("el Vampyric Poisoner recupera lo que muerde (skeleton_poison_random.script:298-305)", () => {
    const e = esqueleto();
    e.inter.paso(0);
    const g = e.g();
    assert.ok(g, "el esqueleto nace con guion");
    // La variante es un `$rand(1,6)` al nacer (:63); se fija la 2, la del vampiro.
    g.guion.ponerVar("IS_VAMPIRE", "1");
    e.i.vida = 100;
    const antes = e.i.vida;
    e.correr(20);
    const dados = e.golpes.reduce((a, b) => a + b, 0);
    assert.ok(e.golpes.length >= 1, "algún mordisco ha entrado (si no, lo de abajo no mide nada)");
    assert.equal(e.manada.costuraFallos ?? 0, 0, "la costura no ha reventado («e.dar is not a function»)");
    assert.ok(Math.abs(e.i.vida - (antes + dados)) < 0.01 * e.golpes.length, `vida ${e.i.vida}, esperaba ${antes} + ${dados}`);
  });

  await t.test("CONTROL: el mismo esqueleto SIN ser vampiro no gana nada al morder", () => {
    const e = esqueleto();
    e.inter.paso(0);
    e.g().guion.ponerVar("IS_VAMPIRE", "0");
    e.i.vida = 100;
    e.correr(20);
    assert.ok(e.golpes.length >= 1);
    assert.equal(e.i.vida, 100);
  });

  await t.test("`CMSMonster::Give`: no pasa del máximo, no baja de cero y no mata (msmonsterserver.cpp:1971-1998)", () => {
    const e = esqueleto({ hp: 350 });
    e.inter.paso(0);
    const g = e.g();
    // El analizador de verdad: un evento escrito como lo escribe el mod.
    const correrTexto = (texto) => g.guion.ejecutarEvento(eventoDeTexto(texto), []);
    e.i.vida = 340;
    correrTexto("givehp 25");
    assert.equal(e.i.vida, 350, "topado a la vida máxima");
    correrTexto("givehp -1000");
    assert.equal(e.i.vida, 0, "no baja de cero");
    assert.equal(e.manada.costuraFallos ?? 0, 0);
    // «may not trigger death events» (scriptcmds.cpp:3437): no hay `muere`.
    assert.ok(!e.manada.sucesos.some((s) => s.que === "muere"), "no se dispara la muerte");
    e.i.vida = 100;
    correrTexto("givehp ent_me 7");
    assert.equal(e.i.vida, 107, "`ent_me` es él mismo");
  });

  await t.test("a OTRA entidad y el maná de un bicho se APUNTAN, no se callan ni revientan", () => {
    const e = esqueleto();
    e.inter.paso(0);
    const g = e.g();
    e.i.vida = 100;
    g.guion.ejecutarEvento(eventoDeTexto("givehp MY_OWNER 5\ngivemp 3"), []);
    assert.equal(e.i.vida, 100);
    const apuntado = JSON.stringify(g.guion.noSoportados);
    assert.match(apuntado, /givehp/);
    assert.match(apuntado, /givemp/);
  });
});

/** Un evento escrito como lo escribe el mod, partido por el analizador de verdad (el 67). */
function eventoDeTexto(texto) {
  return partirGuion(`{ prueba\n${texto}\n}`).eventos[0];
}
