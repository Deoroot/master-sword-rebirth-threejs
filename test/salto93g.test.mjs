// EL SALTO DE LA ARAÑA, CON SERVIDOR — experimento 93, pieza G.
//
// La pieza A portó el salto (doc/SALTO_93.md) y lo midió en un navegador. Con
// servidor no saltaba: `src/red/fauna.js` no daba `enSuelo` en los objetivos de
// la caza, así que `$get(HUNT_LASTTARGET,onground)` (spider.script:104) se
// apuntaba «sin física» y valía «0». Y debajo había tres huecos más, que sólo
// existen con servidor y con DOS jugadores:
//
//   1. `Partida` no le daba `animar` a su `InteraccionesNpc`: el `playanim
//      critical jumpmiss` del guion se tiraba y su `frame_jump` no salía nunca.
//   2. `dondeEstaElJugador` contestaba con «con quién habla», que fuera de un
//      golpe es el ÚLTIMO QUE ABRIÓ UN MENÚ: la araña medía su `dist` contra él,
//      o contra nadie, y entonces `dist` valía «0» (que es < 70: se pegaba sin
//      haber llegado).
//   3. `applyeffect SPIDER_LATCH_TARGET effects/effect_spiderlatch …`
//      (spider.script:151) iba al mismo «con quién habla».
//
// TODO ENTRA POR DONDE ENTRA EL SERVIDOR (CLAUDE.md §4, el 59 y el 63): una
// `Partida` de verdad con una `Fauna` sobre el suelo liso, la araña del mod con
// las secuencias de su `.mdl`, dos clientes con buzón que entran con
// `MENSAJE.ELEGIR` y se mueven con `MENSAJE.ORDENES` —sin órdenes un cuerpo no
// se simula y `grounded` se queda en su valor de reposo, `false`— y `_paso()`.
// Nadie llama a `_clienteDeAsa`, `cuerpoDe` ni `spider_latch_hit` a mano: lo
// que se mira es lo que le LLEGA a cada buzón.
//
// EL SEGUNDO CASO (§4): Beto abre su propio menú antes de empezar, así que
// «con quién habla» es BETO. Con un jugador, «el que caza la araña» y «el que
// habló el último» son la misma persona y el control no puede fallar.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, BOTON, abrir } from "../src/red/protocolo.js";
import { cargarGuion } from "../tools/scriptsmsr.mjs";
import { eventosDeSecuencia } from "../tools/bicho.mjs";
import { leerMdl } from "../src/bsp/mdl.js";
import { leerSecuencias } from "../src/bsp/mdlanim.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const EFECTOS = "build/msr/efectosguion.json";
const JUGADOR = "build/msr/jugador.json";
const HAY = existsSync(SCRIPTS) && existsSync(MODELOS) && existsSync(EFECTOS) && existsSync(JUGADOR);
const ARANA = "monsters/spider";

/** Las secuencias de un `.mdl` de verdad, con la forma del horneado (como test/salto93a). */
function secuenciasDelModelo(relativo) {
  const m = leerMdl(`${MODELOS}/${relativo}`);
  return leerSecuencias(m).map((s, k) => ({
    indice: k, nombre: s.nombre, fps: s.fps, fotogramas: Math.max(1, s.nFotogramas), bucle: s.bucle,
    actividad: s.actividad, pesoActividad: s.pesoActividad, avance: s.avance, eventos: eventosDeSecuencia(m, k),
  }));
}

/** `Math.random` con semilla mientras dura `fn`: el 20 % del salto es `$rand`. */
async function conSemilla(semilla, fn) {
  const real = Math.random;
  let s = semilla >>> 0;
  Math.random = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  try { return await fn(); } finally { Math.random = real; }
}

/**
 * La araña a 3 m de Ana; Beto a 60 m, fuera de los 200 u del salto. Beto
 * abre su menú: desde ahí `hablandoCon` es él.
 */
async function montar({ saltaAna = false } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, ARANA));
  const censo = {
    mapa: "liso", unidadesPorMetro: 39.37, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_spider", script: ARANA, clave: "b", nombre: ficha.nombre, hp: 1000,
      ancho: ficha.ancho, alto: ficha.alto, parado: ficha.parado, andando: ficha.andando, piel: 0,
      escena: [-3, 0, 0], yaw: 0, luz: [0, 0, 0], hostil: true, relacion: -4, ia: { ...ficha.ia },
    }],
  };
  const mundo = await mundoLiso();
  let k = 1;
  const azar = () => { k = (k * 1664525 + 1013904223) >>> 0; return k / 4294967296; };
  const fauna = new Fauna({
    censo, mundo, azar,
    secuenciasPorClave: new Map([["b", secuenciasDelModelo(ficha.modelo)]]),
    cajasPorClave: new Map([["b", { min: [-17, -17, 0], max: [17, 17, 40] }]]),
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.1, 0] } },
    guiones: { guiones: { [ARANA]: cargarGuion(ARANA) } },
    efectos: JSON.parse(readFileSync(EFECTOS, "utf8")),
    fichaDelJugador: JSON.parse(readFileSync(JUGADOR, "utf8")),
  });
  const quienes = [];
  for (const nombre of ["Ana", "Beto"]) {
    const dentro = [];
    const b = { dentro, enviar: (t) => dentro.push(abrir(t)), al: () => () => {} };
    const c = partida.conectar(b, { nombre });
    await c.sesion.arrancar();
    const p = await c.sesion.crear({ nombre, genero: "female" });
    await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: p.id });
    quienes.push({
      c, b, p,
      textos: () => dentro.filter((m) => m.t === MENSAJE.TEXTO).map((m) => String(m.texto)),
      pantallas: () => dentro.filter((m) => m.t === MENSAJE.PANTALLA),
    });
  }
  const [ana, beto] = quienes;
  beto.c.cuerpo.colocar([60, 0.1, 0]);
  await partida.recibir(beto.c.id, { t: MENSAJE.PEDIRMENU, id: null });
  const arana = fauna.manada.instancias[0];
  const guion = () => partida.interacciones.guionesVivos.get(arana.id) ?? null;
  const rastro = (ev) => (guion()?.guion?.rastro ?? []).filter((r) => r.evento === ev).length;
  let seq = 0;
  /** Corre `segundos` a 100 pasos por segundo, con una orden de 10 ms por cliente y paso. */
  const pasar = async (segundos, hasta = null) => {
    for (let n = 0; n < Math.round(segundos * 100); n++) {
      partida._paso();
      seq++;
      for (const q of quienes) {
        const botones = saltaAna && q === ana ? BOTON.SALTAR : 0;
        await partida.recibir(q.c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq, msec: 10, botones }] });
      }
      if (hasta?.()) return true;
    }
    return false;
  };
  return { partida, arana, ana, beto, guion, rastro, pasar };
}

const VENENO = "Leaping Cave Spider hits you: 5.0 poison damage.";

describe("con servidor, la araña salta sobre UN jugador y sólo ése se envenena", { skip: !HAY }, () => {
  test("CONTROL: con Beto en su menú, «con quién habla» es Beto y no Ana", async () => {
    const { partida, beto } = await montar();
    assert.equal(partida._aQuienHabla(), beto.c, "si no, el segundo caso no existe y lo de abajo no puede fallar");
  });

  // CORRECCIÓN DEL 94: esto era `conSemilla(3, …)` y una sola pasada de 30 s,
  // y la semilla 3 estaba AFINADA AL RELOJ DE 2,0 s. El salto es un dado
  // —`$rand(0,99) < SPIDER_LATCH_ATKCHANCE` cada `repeatdelay 4`,
  // spider.script:93-98, más `!IS_ATTACKING` y la distancia—, y medido sobre
  // las semillas 1-8 falla en dos de cada ocho CON LOS DOS RELOJES (2,0: la 6
  // y la 7; 2,8: la 2 y la 3). Al pasar la araña a su ciclo ocioso de verdad,
  // 2,8 s (base_npc_attack.script:7, doc/CICLO_94.md), el orden de las tiradas
  // cambió y la 3 cayó del lado malo: un rojo sin nada roto. El remedio es el
  // del 76: se le dan vueltas al sorteo hasta que sale, y se dice en cuántas.
  test("salta sobre Ana: `frame_jump`, se pega, y el veneno y su pantalla llegan a Ana y NO a Beto", async (t) => {
    const fallidas = [];
    for (const semilla of [3, 1, 4, 5, 6, 7, 8, 2]) {
      const hecho = await conSemilla(semilla, () => saltaSobreAna(semilla, fallidas));
      if (hecho) { t.diagnostic(`se pegó con la semilla ${semilla}; antes, sin pegarse en 30 s: ${JSON.stringify(fallidas)}`); return; }
    }
    assert.fail(`no se ha pegado en 30 s con ninguna de las 8 semillas: ${JSON.stringify(fallidas)}`);
  });

  async function saltaSobreAna(semilla, fallidas) {
    const { arana, ana, beto, guion, rastro, pasar } = await montar();
    const llego = await pasar(30, () => rastro("spider_latch_hit") >= 1);
    if (!llego) {
      fallidas.push({ semilla, frame_jump: rastro("frame_jump"), apuntes: guion()?.guion?.noSoportados?.filter((x) => /onground|dist/.test(x.nombre)) });
      return false;
    }
    assert.ok(rastro("frame_jump") >= 1, "el salto sale del fotograma 22 de `jumpmiss`: sin `animar` no hay salto");
    assert.equal(arana.objetivoCazado, "j" + ana.c.id, "control: cazaba a Ana");
    assert.equal(guion().guion.vars.get("SPIDER_LATCH_TARGET"), String(ana.p.id), "se pega al asa de Ana");
    // `$get(<Ana>,onground)` lo contestó la física: no se apuntó «sin física».
    assert.ok(!guion().guion.noSoportados.some((x) => /onground\) sin física/.test(x.nombre)), JSON.stringify(guion().guion.noSoportados));
    await pasar(12);
    assert.ok(ana.textos().includes("You have been poisoned!"), JSON.stringify(ana.textos()));
    const mordiscos = ana.textos().filter((t) => t.trim() === VENENO).length;
    // Cuatro, como en la sonda de un jugador (doc/SALTO_93.md, cabecera).
    //
    // CORRECCIÓN DEL 94: cuatro mordiscos de 5 son 20 y Ana tiene 15 de vida
    // máxima; con los mordiscos normales de antes del salto, MUERE en el
    // segundo o el tercero (medido, semilla 1: 7,8 → 2,8 → 0 «MUERTA», y el
    // «The poison subsides.» llega a los 4,0 s igual). Los «≥ 4» que salían
    // eran DOS envenenamientos —el segundo tras reaparecer— y dependían de la
    // hora del salto: 1, 3, 4, 5 o 6 según la semilla, con el reloj de 2,0 y
    // con el de 2,8. Lo que esta prueba mide es A QUIÉN llega el veneno, y
    // para eso basta uno; los cuatro de `dot_poison` (base_dot.script: el
    // primero a los 0,5 s y uno por segundo) son de un jugador que aguanta.
    assert.ok(mordiscos >= 1, `mordiscos del veneno en Ana: ${mordiscos} ${JSON.stringify(ana.textos())}`);
    assert.ok(ana.pantallas().some((m) => m.que === "icono" && m.nombre === "DOT_poison"), "el icono del veneno, a Ana");
    // EL OTRO NO: ni el texto, ni el daño, ni la pantalla.
    assert.ok(!beto.textos().some((t) => /poison/i.test(t)), JSON.stringify(beto.textos()));
    assert.equal(beto.pantallas().length, 0, JSON.stringify(beto.pantallas()));
    return true;
  }

  test("CONTROL NEGATIVO: con Ana saltando sin parar, la araña la caza y no salta", () => conSemilla(3, async () => {
    const { arana, ana, guion, rastro, pasar } = await montar({ saltaAna: true });
    await pasar(30);
    assert.equal(arana.objetivoCazado, "j" + ana.c.id, "control: la caza igual");
    // Control de que el bloque del salto (spider.script:93, `repeatdelay 4`)
    // ha dado vueltas: si no corriera, «no salta» sería el valor de reposo.
    const vueltas = Object.entries(guion().repeticiones.vueltas).find(([n]) => /línea 93/.test(n))?.[1] ?? 0;
    assert.ok(vueltas >= 5, `vueltas del bloque del salto: ${vueltas}`);
    assert.equal(rastro("frame_jump"), 0, "con el objetivo en el aire no salta (spider.script:104)");
    assert.ok(!ana.textos().includes("You have been poisoned!"));
  }));
});
