// EL 94: MATAR A UN ALDEANO, ¿RESTA EXPERIENCIA?
//
// El 93 dejó escrito (doc/FICHAS_93.md, «Una cosa que no es de esta pieza») que
// en el motor matar a un aldeano RESTA, porque `NPCs/default_human` hace
// `skilllevel -10` (:50). Leído el motor entero, NO resta: no da nada.
//
//   msmonsterserver.cpp:2506-2518  `if (dmg > 0)` y `xp = m_SkillLevel * ...`,
//                                  sin mirar el signo: sale −10 y se llama a
//                                  `pPlayer->LearnSkill(n, r, xp)`
//   playerstats.cpp:81-83          `iRemainingExp = EnemySkillLevel;
//                                  while (iRemainingExp > 0)` — con −10 el
//                                  bucle no entra: ni resta ni el mínimo de 1
//   msmonsterserver.cpp:2540-2545  `if (xpsend > 0 && !xp_custom)` → sin
//                                  `game_xpgain`, sin «* N XP Awarded»
//   msmonsterserver.cpp:2750       y aunque se entrara, `V_max(EnemySkillLevel, 0)`
//
// Lo que se prueba aquí entra por donde entra el juego CON SERVIDOR: un mensaje
// `PEGAR` a una `Partida`, con la ficha HORNEADA del aldeano de Gate City (no
// un `experiencia: -10` escrito a mano — la trampa del 59). Y lleva su
// segundo caso, el goblin del mismo horneado, que sí da.
//
// EL CONTROL QUE PUEDE PONERSE ROJO: con un personaje recién hecho, quitar la
// guarda del reparto NO cambia nada — `aprender` recorta el −10 a 0 y no
// entrega. Sólo muerde cuando a la propiedad le falta MENOS DE UN PUNTO para
// subir: ahí `aprender` entrega el mínimo de 1 (msmonsterserver.cpp:2762-2763)
// y el motor no, porque no llega a llamarlo. Por eso la propiedad se pone a
// medio punto del umbral antes de matar: es el único sitio donde la diferencia
// existe (el 71: *una prueba sobre una diferencia tiene que poner los números
// en los que la diferencia existe*).

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, abrir } from "../src/red/protocolo.js";
import { expNecesaria } from "../src/juego/stats.js";
import { experienciaDelBicho } from "../src/juego/servidor.js";
import { expDeLaMuerte } from "../src/play/golpe.js";

const BICHOS = "build/gatecity/bichos.json";
const HAY = existsSync(BICHOS);

// Las secuencias no son lo que se mide: la muerte y el reparto no dependen de
// ellas. Lo que viene del horneado es la FICHA (vida, experiencia, relación).
const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 1, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "die", fps: 30, fotogramas: 40, bucle: false, actividad: 36, pesoActividad: 1, avance: [0, 0, 0] },
];

const CATALOGO = {
  objetos: [{
    id: "weapon_shortsword", nombre: "Short Sword", peso: 40,
    multiplicadorDeCarga: 2,
    ataques: [{ nombre: "swing", dano: 9, danoRango: 5, alcance: 60, carga: 1, habilidad: "swordsmanship", tipoDano: "slash" }],
  }],
};

function sordo() {
  return { enviar(t) { abrir(t); }, al: () => () => {} };
}

/** Uno del horneado de Gate City, por su guion, puesto a un metro del centro. */
function delHorneado(script) {
  const b = JSON.parse(readFileSync(BICHOS, "utf8"));
  const c = b.colocados.find((x) => x.script === script);
  assert.ok(c, `el horneado trae un ${script}`);
  // Sin su `msarea_monsterspawn`: los goblins nacen de uno y aquí no hay mapa
  // que lo encienda. La ficha es la misma.
  return { b, c: { ...c, aparecedor: null, escena: [1, 0, 0], ia: { ...c.ia, pasea: false } } };
}

async function montar(script) {
  const { b, c } = delHorneado(script);
  const censo = {
    mapa: "liso", unidadesPorMetro: b.unidadesPorMetro, razas: b.razas,
    modelos: b.modelos.filter((m) => m.clave === c.clave), colocados: [c],
  };
  const mundo = await mundoLiso();
  const fauna = new Fauna({
    censo, mundo,
    secuenciasPorClave: new Map([[c.clave, SECUENCIAS]]),
    cajasPorClave: new Map([[c.clave, { min: [-16, -16, 0], max: [16, 16, 72] }]]),
    azar: () => 0.5,
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0, catalogo: CATALOGO,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0, 0] } },
  });
  const cliente = partida.conectar(sordo());
  await cliente.sesion.arrancar();
  const p = await cliente.sesion.crear({ nombre: "Ana", genero: "female", arma: "weapon_shortsword" });
  await partida.recibir(cliente.id, { t: MENSAJE.ELEGIR, id: p.id });
  return { partida, cliente, ficha: c };
}

/** Pone `swordsmanship.power` a medio punto de subir: donde la guarda muerde. */
function aMedioPunto(p) {
  const prop = p.habilidades.swordsmanship.power;
  prop.exp = expNecesaria(prop.valor) - 0.5;
  return prop;
}

async function matar(partida, cliente) {
  const i = partida.fauna.manada.de(0);
  for (let k = 0; k < 40 && !i.muerto; k++) {
    await partida.recibir(cliente.id, {
      t: MENSAJE.PEGAR, id: 0, dano: 9999, alcance: 100000, cubo: "swordsmanship.power", tipo: "slash",
    });
  }
  assert.equal(i.muerto, true, "se le ha matado");
  return cliente.sucesosPendientes.filter((x) => x.que === "tupegas").pop();
}

test("matar a un aldeano no da experiencia, ni la resta (el 94)", { skip: !HAY && `falta ${BICHOS}` }, async (t) => {
  await t.test("el horneado dice −10, que es el `skilllevel` de NPCs/default_human:50", () => {
    const { c } = delHorneado("NPCs/default_human");
    assert.equal(c.ia.experiencia, -10);
    assert.equal(c.hostil, false, "un aldeano no es hostil");
  });

  await t.test("y ese −10 cruza tal cual: `if NPC_GIVE_EXP > 0` sale sin tocarlo", () => {
    // base_self_adjust.script:284. Antes del 94 aquí salía 0.
    assert.equal(experienciaDelBicho({ base: -10 }).exp, -10);
    assert.equal(experienciaDelBicho({ base: 0 }).exp, 0);
    // Y el reparto tampoco mira el signo, sólo `if (dmg > 0)` (:2506).
    assert.deepEqual(
      expDeLaMuerte({ nivel: -10, vidaMaxima: 25, porCubo: { "swordsmanship.power": 9999 } }),
      { "swordsmanship.power": -10 });
  });

  await t.test("CON SERVIDOR: matarlo deja la hoja igual, sin el mínimo de 1, y sin aviso", async () => {
    const { partida, cliente } = await montar("NPCs/default_human");
    const p = cliente.sesion.personaje;
    const prop = aMedioPunto(p);
    const antes = JSON.stringify(p.habilidades);
    const s = await matar(partida, cliente);
    assert.equal(s.muerto, true);
    // `total` es el `xpsend` del motor: sin él no hay `game_xpgain` en el
    // navegador (main.js, `s.experiencia?.total > 0`).
    assert.equal(s.experiencia.total, 0, `experiencia: ${JSON.stringify(s.experiencia)}`);
    assert.equal(s.experiencia.entregado, 0);
    assert.equal(JSON.stringify(p.habilidades), antes,
      `la hoja no se mueve: power ${prop.valor} con ${prop.exp} de exp`);
  });

  await t.test("SEGUNDO CASO: el goblin del mismo horneado sí da, y en el mismo estado", async () => {
    const { partida, cliente, ficha } = await montar("monsters/goblin");
    assert.equal(ficha.ia.experiencia, 25);
    const p = cliente.sesion.personaje;
    aMedioPunto(p);
    const antes = JSON.stringify(p.habilidades);
    const s = await matar(partida, cliente);
    assert.ok(s.experiencia.total > 0, `experiencia: ${JSON.stringify(s.experiencia)}`);
    assert.notEqual(JSON.stringify(p.habilidades), antes, "y se apunta en la hoja");
  });
});
