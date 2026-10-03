// `setmovedest` Y `$cansee` CON SERVIDOR: A QUIÉN MIRAN — experimento 94.
//
// Hasta el 93 los dos ganchos de `src/red/partida.js` (`mandarADestino` y
// `lineaDeVision`) resolvían «el jugador» con `_aQuienHabla()`: el ÚLTIMO
// jugador del servidor que abrió un menú, con quien fuera. El motor no tiene
// esa casilla: los dos comandos resuelven su parámetro con `RetrieveEntity`
// (npcscript.cpp:1628 y :1765), que es el asa (`StringToEnt`) o lo guardado en
// ESTA entidad (`m_EntityList`, global.cpp:382-398). Ver `_cuerpoDeRef`.
//
// TODO ENTRA POR DONDE ENTRA EL SERVIDOR (CLAUDE.md §4, el 59 y el 63): una
// `Partida` de verdad con su `Fauna` sobre el suelo liso, dos clientes que
// entran con `MENSAJE.ELEGIR`, se mueven con `MENSAJE.ORDENES` y abren menús con
// `MENSAJE.PEDIRMENU`, y `_paso()`. El guion se le da como TEXTO al analizador
// (la regla del 67), y nadie llama a `_cuerpoDeRef`, `entidadDeGuion` ni a los
// ganchos para obtener lo que se afirma: se lee lo que el GUION guardó y a
// dónde mandó al NPC.
//
// EL SEGUNDO CASO (el 50): Ana habla con el vigía y luego Beto abre el menú de
// OTRO NPC, así que «con quién habla» pasa a ser Beto mientras el guion del
// vigía sigue siendo de Ana. Con un jugador los dos son la misma persona y el
// control no puede fallar.
//
// El guion es NUESTRO y mínimo, y lo es a propósito: lo que se mide es la
// costura del servidor, y un guion del mod que llegue aquí desde un reloj (el
// `npcatk_hunt` de base_npc_attack.script:108, :114) pasa además por la lista
// de bucles cerrados del 91 y por la IA. Las dos líneas que usa están en el
// mod tal cual: `setmovedest PARAM1 9999` (las 65 de Edana del 81) y
// `$cansee(<asa>)` (base_npc_attack.script:108).

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, abrir } from "../src/red/protocolo.js";
import { partirGuion } from "../src/play/guion.js";
import { loVe } from "../src/play/movedest.js";
import { ojoDe } from "../src/play/manada.js";
import { eventosDeSecuencia } from "../tools/bicho.mjs";
import { leerMdl } from "../src/bsp/mdl.js";
import { leerSecuencias } from "../src/bsp/mdlanim.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const HAY = existsSync(SCRIPTS) && existsSync(MODELOS);
// Un cuerpo de verdad para el NPC: el de la araña, sin daño (no es de combate,
// así que no corre la costura del 91 ni la IA de caza le pone objetivo).
const MODELO_DE = "monsters/spider";

/**
 * EL GUION DEL VIGÍA. Al abrirle el menú se guarda el asa de quien habla y,
 * medio segundo después —FUERA del menú, desde un reloj, que es donde
 * `_aQuienHabla()` ya no es él—, mira y anda hacia él por las tres formas de
 * nombrar a un jugador: su asa, `player` y `ent_lastspoke`.
 */
const GUION = `
{ game_menu_getoptions
	setvard ANTERIOR94 QUIEN94
	setvard QUIEN94 PARAM1
	callevent 0.5 mira94
}
{ mira94
	setvard VIO_ASA $cansee(QUIEN94)
	setvard VIO_PLAYER $cansee(player)
	setmovedest ent_lastspoke 10
	setvard MIRO94 1
}
{ anda94
	setmovedest QUIEN94 10
	setvard ANDO94 1
}
{ anda_anterior94
	setmovedest ANTERIOR94 10
	setvard ANDO_ANTERIOR94 1
}
`;

function secuenciasDelModelo(relativo) {
  const m = leerMdl(`${MODELOS}/${relativo}`);
  return leerSecuencias(m).map((s, k) => ({
    indice: k, nombre: s.nombre, fps: s.fps, fotogramas: Math.max(1, s.nFotogramas), bucle: s.bucle,
    actividad: s.actividad, pesoActividad: s.pesoActividad, avance: s.avance, eventos: eventosDeSecuencia(m, k),
  }));
}

/**
 * El vigía en x = −3 m; Ana en el centro (x = 0); Beto en x = +3, DETRÁS de
 * Ana en la misma línea. Así el rayo del vigía a Ana la toca a ella (verla) y
 * el rayo a Beto choca con Ana antes (no verle, combat.cpp:1240): las dos
 * respuestas posibles de `$cansee` son distintas, y las de `setmovedest`
 * también (0 contra 118 unidades). Un segundo NPC lejos, para que Beto le abra
 * el menú.
 */
async function montar({ betoHabla = true, betoAlVigia = false } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, MODELO_DE));
  const npc = (escena, nombre, script) => ({
    clase: "msmonster_x", script, clave: "b", nombre, hp: 100,
    ancho: 32, alto: 60, parado: ficha.parado, andando: ficha.andando, piel: 0,
    escena, yaw: 0, luz: [0, 0, 0], hostil: false, relacion: 0,
    ia: { ...ficha.ia, dano: 0, alto: 60, ancho: 32 },
  });
  const censo = {
    mapa: "liso", unidadesPorMetro: 39.37, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [npc([-3, 0, 0], "Vigia", "prueba/vigia94"), npc([-40, 40, 0], "Otro", "prueba/otro94")],
  };
  const mundo = await mundoLiso();
  let k = 1;
  const azar = () => { k = (k * 1664525 + 1013904223) >>> 0; return k / 4294967296; };
  const fauna = new Fauna({
    censo, mundo, azar,
    secuenciasPorClave: new Map([["b", secuenciasDelModelo(ficha.modelo)]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 60] }]]),
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.1, 0] } },
    guiones: { guiones: {
      "prueba/vigia94": partirGuion(GUION),
      "prueba/otro94": partirGuion("{ game_menu_getoptions\n\tsetvard NADA 1\n}"),
    } },
  });
  const quienes = [];
  for (const nombre of ["Ana", "Beto"]) {
    const dentro = [];
    const b = { dentro, enviar: (t) => dentro.push(abrir(t)), al: () => () => {} };
    const c = partida.conectar(b, { nombre });
    await c.sesion.arrancar();
    const p = await c.sesion.crear({ nombre, genero: "female" });
    await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: p.id });
    quienes.push({ c, p });
  }
  const [ana, beto] = quienes;
  const [vigia, otro] = fauna.manada.instancias;
  let seq = 0;
  const pasar = async (segundos, hasta = null) => {
    for (let n = 0; n < Math.round(segundos * 100); n++) {
      partida._paso();
      seq++;
      for (const q of quienes) {
        // Recolocados en cada paso: lo que se mide es A QUIÉN, y la geometría
        // tiene que seguir siendo la de arriba mientras se mide (el 82).
        q.c.cuerpo.colocar(q === ana ? [0, 0.1, 0] : [3, 0.1, 0]);
        await partida.recibir(q.c.id, { t: MENSAJE.ORDENES, ordenes: [{ seq, msec: 10, botones: 0 }] });
      }
      if (hasta?.()) return true;
    }
    return false;
  };
  await pasar(0.3);
  const guion = () => partida.interacciones.guionesVivos.get(vigia.id) ?? null;
  const v = (n) => guion()?.guion?.vars?.get(n);
  // Ana habla con el vigía; Beto, DESPUÉS, con el otro.
  await partida.recibir(ana.c.id, { t: MENSAJE.PEDIRMENU, id: vigia.id });
  if (betoHabla) await partida.recibir(beto.c.id, { t: MENSAJE.PEDIRMENU, id: betoAlVigia ? vigia.id : otro.id });
  return { partida, fauna, ana, beto, vigia, otro, guion, v, pasar };
}

/** De los dos jugadores, a cuál está más cerca el destino (en unidades). */
function hacia(vigia, ana, beto) {
  const o = vigia.ultimoDestino?.origen;
  if (!o) return null;
  const U = 39.37;
  const d = (q) => Math.hypot(o[0] - q.c.cuerpo.feet[0] * U, o[2] - q.c.cuerpo.feet[2] * U);
  return d(ana) < d(beto) ? "Ana" : "Beto";
}

describe("con servidor y dos jugadores, `setmovedest` y `$cansee` van al jugador que nombra el guion", { skip: !HAY }, () => {
  test("CONTROL: Beto habló el último, así que «con quién habla» es Beto y no Ana", async () => {
    const { partida, beto, ana, guion, v } = await montar();
    assert.equal(partida._aQuienHabla(), beto.c, "si no, el segundo caso no existe y lo de abajo no puede fallar");
    assert.equal(v("QUIEN94"), String(ana.p.id), "el vigía guardó el asa de Ana");
    assert.equal(guion().jugador?.ref, String(ana.p.id), "y su jugador es Ana");
  });

  test("CONTROL de la geometría: Ana tapa a Beto, así que las dos respuestas de `$cansee` son distintas", async () => {
    const { fauna, ana, beto, vigia, pasar } = await montar();
    await pasar(0.05);
    // El rayo con el cuerpo puesto A MANO, sin pasar por la partida: así este
    // control mide sólo la geometría y no depende del arreglo (con la rotura
    // del 94 sigue verde, y por eso los rojos de abajo son del arreglo). Lo
    // que se afirma abajo lo contesta el guion.
    const a = fauna.arnes, U = 39.37, n = vigia.donde;
    const ve = (cuerpo) => {
      const q = a.entidadDeGuion("x", vigia, cuerpo);
      return loVe({
        miOjo: [n[0], n[1] + ojoDe(vigia) / U, n[2]],
        suOjo: [q.ojo[0] / U, q.ojo[1] / U, q.ojo[2] / U],
        suColisionador: q.colisionador, trazar: a.trazarParaVer(vigia),
      });
    };
    assert.equal(ve(ana.c.cuerpo), true, "a Ana la ve");
    assert.equal(ve(beto.c.cuerpo), false, "a Beto no: Ana está en medio");
  });

  test("desde un reloj, `$cansee(<asa de Ana>)` y `$cansee(player)` miran a ANA, no al último que abrió un menú", async () => {
    const { v, pasar, guion } = await montar();
    assert.ok(await pasar(2, () => v("MIRO94") === "1"), `mira94 no corrió: ${JSON.stringify(guion()?.guion?.noSoportados)}`);
    assert.equal(v("VIO_ASA"), "1", "con el asa de Ana: la ve (con el fallo, el rayo iba a Beto y chocaba con Ana)");
    assert.equal(v("VIO_PLAYER"), "1", "con `player`: el jugador de ESTE guion, Ana");
  });

  test("desde un reloj, `setmovedest ent_lastspoke` manda al vigía hacia ANA (su `m_EntityList`), no hacia Beto", async () => {
    const { v, pasar, vigia, ana, beto } = await montar();
    assert.ok(await pasar(2, () => v("MIRO94") === "1"));
    assert.equal(hacia(vigia, ana, beto), "Ana", JSON.stringify(vigia.ultimoDestino));
  });

  test("`setmovedest <asa de Ana>` desde un evento llamado sin menú va hacia Ana", async () => {
    const { v, pasar, guion, vigia, ana, beto } = await montar();
    await pasar(1);
    guion().llamar("anda94");
    assert.equal(v("ANDO94"), "1");
    assert.equal(hacia(vigia, ana, beto), "Ana", JSON.stringify(vigia.ultimoDestino));
  });

  test("un nombre que NO es un jugador ya no se convierte en el jugador: el otro NPC es el otro NPC", async () => {
    const { partida, vigia, otro, ana, pasar } = await montar();
    await pasar(0.05);
    // Antes del 94 cualquier `ref` con un cuerpo al lado era el jugador
    // (`entidadDeGuion`, fauna.js). Ahora `_cuerpoDeRef` contesta `null` y la
    // fauna busca en la manada. El nombre del otro NPC es su `targetname`, si
    // lo tiene; sin él, nadie — y nunca Ana.
    assert.equal(partida._cuerpoDeRef("Otro", vigia), null);
    assert.equal(partida._cuerpoDeRef("ent_laststruckbyme", vigia), null, "el vigía no le ha pegado a nadie");
    assert.equal(partida._cuerpoDeRef(String(ana.p.id), otro), ana.c.cuerpo, "un asa nombra a su jugador desde cualquier guion");
  });
  test("un asa nombra a SU jugador aunque el guion esté ahora con otro (`StringToEnt`, global.cpp:384)", async () => {
    // Ana y luego Beto abren el menú del VIGÍA: su jugador es Beto, y en
    // ANTERIOR94 queda el asa de Ana. `setmovedest ANTERIOR94` es Ana por su
    // asa —el paso 1 de `RetrieveEntity`—, no por ser «el jugador del guion».
    const { v, pasar, guion, vigia, ana, beto } = await montar({ betoAlVigia: true });
    assert.equal(guion().jugador?.ref, String(beto.p.id), "control: el jugador del guion es Beto");
    assert.equal(v("ANTERIOR94"), String(ana.p.id), "control: el asa guardada es la de Ana");
    await pasar(1);
    guion().llamar("anda_anterior94");
    assert.equal(v("ANDO_ANTERIOR94"), "1");
    assert.equal(hacia(vigia, ana, beto), "Ana", JSON.stringify({ destino: vigia.ultimoDestino, apuntes: guion().guion.noSoportados }));
  });
});
