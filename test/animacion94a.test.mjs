// LAS ANIMACIONES DE UNA VEZ Y EL RITMO DE LOS BICHOS — experimento 94.
//
// Desde que el 93 armó los `repeatdelay` de los guiones de bicho, el jabalí
// de Edana come hierba (`playanim once ANIM_IDLE_EATGRASS`, boar_base.script:
// 79-86) y la rata se estira (`playanim once ANIM_IDLE2`, giantrat.script:76-83)
// MIENTRAS ANDAN: la animación de una vez se ponía y el cuerpo seguía
// avanzando a la velocidad de la de andar. Patinaban.
//
// En el motor ni se interrumpe la animación ni el guion la pide sólo en
// reposo (los dos bloques sólo miran `!IS_HUNTING`/`!IS_FLEEING`): el bicho
// SE PARA, porque el paso sale de la secuencia puesta,
//
//     flTotal = m_flGroundSpeed * pev->framerate * flInterval * ...
//                                           msmonsterserver.cpp:1201
//
// y `m_flGroundSpeed` es el `linearmovement` de ESA secuencia
// (animating.cpp:112, animation.cpp:266-267): `idle2` del jabalí no avanza.
//
// Y dos cosas que iban con ello: `playanim once` llegaba como `critical`
// (`InteraccionesNpc` tiraba el modo) y rompía lo que estuviera corriendo,
// cuando en el motor sólo `critical` rompe (npcscript.cpp:1514-1550); y
// `setanim.framerate` no movía ni el paso ni viajaba en la foto.
//
// TODO ENTRA POR DONDE ENTRA EL SERVIDOR (CLAUDE.md §4, el 59 y el 63): una
// `Partida` de verdad con una `Fauna` sobre el suelo liso, el bicho con las
// secuencias de su `.mdl` y un cliente que entra con `MENSAJE.ELEGIR`. El
// `animar` que se prueba es el que monta `Partida`, no uno escrito aquí; el
// de `src/main.js` lo mide la sonda (`sondas/animacion94.mjs`).

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { Manada } from "../src/play/manada.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, abrir } from "../src/red/protocolo.js";
import { partirGuion } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";
import { cargarGuion } from "../tools/scriptsmsr.mjs";
import { eventosDeSecuencia } from "../tools/bicho.mjs";
import { leerMdl } from "../src/bsp/mdl.js";
import { leerSecuencias } from "../src/bsp/mdlanim.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const EFECTOS = "build/msr/efectosguion.json";
const JUGADOR = "build/msr/jugador.json";
const HAY = existsSync(SCRIPTS) && existsSync(MODELOS) && existsSync(EFECTOS) && existsSync(JUGADOR);
const U = 39.37;

/** Las secuencias de un `.mdl` de verdad, con la forma del horneado (como test/salto93a). */
function secuenciasDelModelo(relativo) {
  const m = leerMdl(`${MODELOS}/${relativo}`);
  return leerSecuencias(m).map((s, k) => ({
    indice: k, nombre: s.nombre, fps: s.fps, fotogramas: Math.max(1, s.nFotogramas), bucle: s.bucle,
    actividad: s.actividad, pesoActividad: s.pesoActividad, avance: s.avance, eventos: eventosDeSecuencia(m, k),
  }));
}

/**
 * Una `Partida` con UN bicho del mod (su ficha y su modelo) y un jugador a
 * 3 km, que no caza nadie. `texto` cambia el guion por uno escrito aquí y
 * partido por el analizador (la regla del 67); sin él, el guion del mod.
 */
async function montar(script, { texto = null } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, script));
  const secuencias = secuenciasDelModelo(ficha.modelo);
  const censo = {
    mapa: "liso", unidadesPorMetro: U, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_x", script, clave: "b", nombre: ficha.nombre, hp: 100,
      ancho: ficha.ancho, alto: ficha.alto, parado: ficha.parado, andando: ficha.andando, piel: 0,
      escena: [0, 0, 0], yaw: 0, luz: [0, 0, 0], hostil: false, relacion: -2, ia: { ...ficha.ia },
    }],
  };
  const guion = texto ? resolverGuion(script, () => partirGuion(texto)) : cargarGuion(script);
  const mundo = await mundoLiso();
  let k = 1;
  const azar = () => { k = (k * 1664525 + 1013904223) >>> 0; return k / 4294967296; };
  const fauna = new Fauna({
    censo, mundo, azar,
    secuenciasPorClave: new Map([["b", secuencias]]),
    cajasPorClave: new Map([["b", { min: [-17, -17, 0], max: [17, 17, 40] }]]),
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.1, 0] } },
    guiones: { guiones: { [script]: guion } },
    efectos: JSON.parse(readFileSync(EFECTOS, "utf8")),
    fichaDelJugador: JSON.parse(readFileSync(JUGADOR, "utf8")),
  });
  const dentro = [];
  const buzon = { dentro, enviar: (t) => dentro.push(abrir(t)), al: () => () => {} };
  const c = partida.conectar(buzon, { nombre: "Ana" });
  await c.sesion.arrancar();
  const p = await c.sesion.crear({ nombre: "Ana", genero: "female" });
  await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: p.id });
  c.cuerpo.colocar([3000, 0.1, 0]);
  const i = fauna.manada.instancias[0];
  const g = () => partida.interacciones.guionesVivos.get(i.id) ?? null;
  const rastro = (ev) => (g()?.guion?.rastro ?? []).filter((r) => r.evento === ev).length;
  let seq = 0;
  /** Un paso de 10 ms, con su orden (sin órdenes el cuerpo no se simula). */
  const paso = async () => {
    partida._paso();
    partida.repartir();
    seq++;
    await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq, msec: 10, botones: 0 }] });
  };
  const fotos = () => dentro.filter((m) => m.t === MENSAJE.FOTO);
  return { partida, fauna, censo, secuencias, i, g, rastro, paso, fotos };
}

/** El paso de un bicho en el plano, en UNIDADES. */
const avance = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]) * U;

describe("el jabalí de Edana se PARA a comer hierba, aunque lleve destino (msmonsterserver.cpp:1201)", { skip: !HAY }, () => {
  test("90 s de paseo: con `idle2` puesta no avanza ni una unidad; con `walk`, sí", async () => {
    const { i, paso } = await montar("monsters/boar");
    // El bloque de la hierba (boar_base.script:79-86) es anónimo: se cuenta lo
    // que deja en la manada, que es `idle2` con su candado echado.
    let comiendoConDestino = 0, avanceComiendo = 0, andandoConDestino = 0, avanceAndando = 0, vecesHierba = 0;
    let antes = [...i.donde], genAntes = i.anim.gen;
    const comiendo = () => i.anim.nombre === "idle2" && i.unaVezHasta !== null;
    let yaComia = comiendo();
    for (let n = 0; n < 9000; n++) {
      await paso();
      const d = avance(antes, i.donde);
      antes = [...i.donde];
      if (i.anim.gen !== genAntes && i.anim.nombre === "idle2") vecesHierba++;
      genAntes = i.anim.gen;
      // Sólo los pasos que EMPIEZAN y acaban comiendo: en el del cambio el
      // avance lo dio la de andar, porque en este puerto la manada mueve antes
      // de que el reloj de guiones pida la hierba. Es una vuelta de 10 ms.
      const ahora = comiendo();
      if (yaComia && ahora && i.destino) { comiendoConDestino++; avanceComiendo += d; }
      if (i.anim.nombre === "walk" && i.destino) { andandoConDestino++; avanceAndando += d; }
      yaComia = ahora;
    }
    const detalle = JSON.stringify({ vecesHierba, comiendoConDestino, avanceComiendo, andandoConDestino, avanceAndando });
    // CONTROL: ha comido hierba con destino puesto. Sin esto el cero de abajo
    // sería el valor de reposo (CLAUDE.md §4).
    assert.ok(vecesHierba >= 3, `come hierba (cada 8-12 s): ${detalle}`);
    assert.ok(comiendoConDestino >= 20, `y alguna vez con un destino puesto: ${detalle}`);
    // CONTROL POSITIVO: el mismo instrumento ve andar.
    assert.ok(avanceAndando / andandoConDestino > 0.2, `andando avanza (~0,28 u por paso de 10 ms): ${detalle}`);
    // LA REGLA: comiendo, `m_flGroundSpeed` de `idle2` es 0.
    assert.equal(avanceComiendo, 0, `comiendo NO avanza: ${detalle}`);
  });

  test("al soltar el destino no se queda andando en el sitio con `walk` puesta", async () => {
    const { i, paso } = await montar("monsters/boar");
    let andaQuieto = 0, peor = 0, racha = 0;
    for (let n = 0; n < 9000; n++) {
      await paso();
      // `walk` sin destino durante más de 0,2 s: el `Think` del motor pide la de
      // reposo en cada vuelta sin destino (msmonsterserver.cpp:589-594).
      if (i.anim.nombre === "walk" && !i.destino && i.objetivoCazado == null) { racha++; peor = Math.max(peor, racha); } else racha = 0;
      if (racha === 20) andaQuieto++;
    }
    assert.equal(andaQuieto, 0, `veces que anduvo en el sitio más de 0,2 s: ${andaQuieto}, la peor ${(peor / 100).toFixed(2)} s`);
  });
});

describe("`playanim once` no rompe lo que corre; `critical` sí (npcscript.cpp:1514-1550)", { skip: !HAY }, () => {
  // La rata de Edana con un guion escrito aquí: un mordisco `critical` y, 0,2 s
  // después —el mordisco dura 0,75 s—, otra animación con el modo a probar.
  // `standidle2` no es de bucle ni la usa nadie más: si sale, la ha puesto esto.
  const guion = (modo) => `{
   repeatdelay 30
   playanim critical attack
   callevent 0.2 la_otra
}
{ la_otra
   playanim ${modo} standidle2
}
{ la_tercera
   playanim once standidle2
}`;

  async function hastaLaOtra(m) {
    for (let n = 0; n < 300; n++) { await m.paso(); if (m.rastro("la_otra") >= 1) return true; }
    return false;
  }

  test("CONTROL: con `critical` la segunda SÍ se pone encima del mordisco", async () => {
    const m = await montar("monsters/giantrat", { texto: guion("critical") });
    assert.ok(await hastaLaOtra(m), "el evento `la_otra` corre");
    assert.equal(m.i.anim.nombre, "standidle2", "el instrumento ve el cambio: sin este control, el de abajo podría ser el reposo");
  });

  test("con `once` la segunda se RECHAZA: sigue el mordisco, y se cuenta el rechazo", async () => {
    const m = await montar("monsters/giantrat", { texto: guion("once") });
    const rechazosAntes = m.i.sigue.rechazos;
    assert.ok(await hastaLaOtra(m), "el evento `la_otra` corre");
    assert.equal(m.i.anim.nombre, "attack", `CAnimOnce::CanChangeTo no deja (monsteranimation.cpp:219-221); puesta ${m.i.anim.nombre}`);
    assert.ok(m.i.sigue.rechazos > rechazosAntes, "y el rechazo se apunta");
  });

  test("con nada corriendo, `once` SÍ se pone (no es que `once` no haga nada)", async () => {
    const m = await montar("monsters/giantrat", { texto: guion("once") });
    for (let n = 0; n < 150; n++) await m.paso();                // el mordisco (0,75 s) acaba
    assert.notEqual(m.i.anim.nombre, "attack", "el mordisco ya se ha soltado");
    m.g().guion.llamar("la_tercera");
    assert.equal(m.i.anim.nombre, "standidle2");
  });
});

describe("`setanim.framerate`: mueve el paso y viaja en la foto (msmonsterserver.cpp:1201, delta.lst:107)", { skip: !HAY }, () => {
  // La rata pasea; el guion le pone el ritmo al nacer.
  const conRitmo = (r) => `{
   repeatdelay 1
   setanim.framerate ${r}
}`;

  async function andadoPorPaso(texto) {
    const m = await montar("monsters/giantrat", { texto });
    let suma = 0, pasos = 0, antes = [...m.i.donde];
    for (let n = 0; n < 6000; n++) {
      await m.paso();
      const d = avance(antes, m.i.donde);
      antes = [...m.i.donde];
      if (m.i.anim.nombre === "walk" && m.i.destino && m.i.unaVezHasta === null && d > 0) { suma += d; pasos++; }
    }
    return { m, porPaso: pasos ? suma / pasos : 0, pasos };
  }

  test("a ritmo 0,5 la rata anda la MITAD por paso que a ritmo 1", async () => {
    const uno = await andadoPorPaso(conRitmo(1));
    const medio = await andadoPorPaso(conRitmo(".5"));
    assert.ok(uno.pasos > 100 && medio.pasos > 100, `las dos andan: ${uno.pasos} y ${medio.pasos} pasos`);
    assert.equal(medio.m.i.fisica.ritmoAnim, 0.5, "control: el guion puso el ritmo");
    const cociente = medio.porPaso / uno.porPaso;
    assert.ok(Math.abs(cociente - 0.5) < 0.02, `cociente ${cociente.toFixed(3)} (${medio.porPaso.toFixed(4)} / ${uno.porPaso.toFixed(4)} u por paso)`);
  });

  test("la foto lleva `r` y el cliente lo aplica; sin `r` es 1", async () => {
    const m = await montar("monsters/giantrat", { texto: conRitmo(".5") });
    for (let n = 0; n < 200; n++) await m.paso();
    const ultima = m.fotos().filter((f) => f.bichos?.length).at(-1);
    const e = ultima?.bichos?.find((b) => b.id === m.i.id);
    assert.equal(e?.r, 0.5, `el estado del bicho en la foto: ${JSON.stringify(e)}`);
    // El cliente: otra manada, con el mismo censo, que sólo coloca.
    const cliente = new Manada(m.censo, { secuenciasPorClave: new Map([["b", m.secuencias]]) });
    cliente.aplicar([e]);
    assert.equal(cliente.de(m.i.id).fisica.ritmoAnim, 0.5);
    cliente.aplicar([{ ...e, r: undefined, g: e.g }]);
    assert.equal(cliente.de(m.i.id).fisica.ritmoAnim, 1, "una foto sin `r` vuelve a ritmo 1");
  });

  test("CONTROL: a ritmo 1 la foto no lleva `r`", async () => {
    const m = await montar("monsters/giantrat", { texto: conRitmo(1) });
    for (let n = 0; n < 200; n++) await m.paso();
    const e = m.fotos().flatMap((f) => f.bichos ?? []).filter((b) => b.id === m.i.id).at(-1);
    assert.ok(e, "el bicho viaja");
    assert.equal(e.r, undefined);
  });
});
