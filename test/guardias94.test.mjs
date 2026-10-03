// EL 94: PEGAR A UN ALDEANO TIENE CONSECUENCIAS — los guardias vienen.
//
// La cadena del mod, entera y por este orden:
//
//   monsters/base_civilian.script:3-6     `game_struck` -> `callevent call_for_help $get(ent_laststruck,id)`
//   monsters/base_civilian.script:8-16    grita uno de cuatro y `callexternal all civilian_attacked
//                                         PARAM1 $get(PARAM1,isplayer)`
//   monsters/base_civilian.script:18-21   y al morir, lo mismo con `ent_laststruck`
//   gatecity/guard.script:105-124         el guardia: no es `hguard`, está a `<= BG_MAX_HEAR_CIV`
//                                         (1024, :15) y no tiene objetivo -> `npcatk_settarget PARAM1`,
//                                         y si te ve, una de cuatro frases
//
// Lo que faltaba eran CUATRO piezas, todas entre piezas que ya funcionaban (el
// 63): el golpe a un NPC sin ficha de combate no llegaba a su guion
// (`noDeCombate`), `ent_laststruck` no se resolvía, el guardia no sabía quién
// era el asa que le pasaban, y su `npcatk_settarget` estaba cerrado (el 91).
// Ver doc/GUARDIAS_94.md.
//
// Se entra por donde entra el juego con servidor: un mensaje `PEGAR` a una
// `Partida`, con las fichas Y LOS GUIONES horneados de Gate City. Nada de lo
// que se mide se construye a mano (el 59): ni el asa, ni la llamada, ni la
// distancia.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, abrir } from "../src/red/protocolo.js";

const BICHOS = "build/gatecity/bichos.json";
const GUIONES = "build/gatecity/guiones.json";
const HAY = existsSync(BICHOS) && existsSync(GUIONES);

// Las cuatro de cada lado, copiadas de los guiones (no del port).
const GRITOS = new Set(["Help! Help!", "Guards! Call the guards!", "Save me!", "Help! Help! I'm being repressed!"]);
const ALTO = new Set(["Hey you! Leave him alone!", "You there, leave him be I said!", "Stop that!",
  "Halt! We'll have no trouble making around here!"]);

const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 1, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "die", fps: 30, fotogramas: 40, bucle: false, actividad: 36, pesoActividad: 1, avance: [0, 0, 0] },
];
const CATALOGO = {
  objetos: [{
    id: "weapon_shortsword", nombre: "Short Sword", peso: 40, multiplicadorDeCarga: 2,
    ataques: [{ nombre: "swing", dano: 9, danoRango: 5, alcance: 60, carga: 1, habilidad: "swordsmanship", tipoDano: "slash" }],
  }],
};

/**
 * Una partida con los bichos horneados que se pidan, cada uno en un sitio (metros
 * de escena). El jugador nace en el origen.
 */
async function montar(puestos) {
  const b = JSON.parse(readFileSync(BICHOS, "utf8"));
  const guiones = JSON.parse(readFileSync(GUIONES, "utf8"));
  const colocados = puestos.map(({ script, escena }) => {
    const c = b.colocados.find((x) => x.script === script);
    assert.ok(c, `el horneado trae un ${script}`);
    // Sin pasear ni aparecedor: lo que se mide no depende de dónde ande.
    return { ...c, aparecedor: null, escena, ia: { ...c.ia, pasea: false } };
  });
  const claves = new Set(colocados.map((c) => c.clave));
  const censo = {
    mapa: "liso", unidadesPorMetro: b.unidadesPorMetro, razas: b.razas,
    modelos: b.modelos.filter((m) => claves.has(m.clave)), colocados,
  };
  const mundo = await mundoLiso();
  const fauna = new Fauna({
    censo, mundo,
    secuenciasPorClave: new Map([...claves].map((k) => [k, SECUENCIAS])),
    cajasPorClave: new Map([...claves].map((k) => [k, { min: [-16, -16, 0], max: [16, 16, 72] }])),
    azar: () => 0.5,
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0, catalogo: CATALOGO, guiones,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0, 0] } },
  });
  const textos = [];
  const cliente = partida.conectar({
    enviar(t) { const m = abrir(t); if (m.t === MENSAJE.TEXTO) textos.push(String(m.texto)); },
    al: () => () => {},
  });
  await cliente.sesion.arrancar();
  const p = await cliente.sesion.crear({ nombre: "Ana", genero: "female", arma: "weapon_shortsword" });
  await partida.recibir(cliente.id, { t: MENSAJE.ELEGIR, id: p.id });
  // Que nazcan los guiones de los bichos (`nacerBichos` corre en el paso).
  for (let k = 0; k < 5; k++) partida.avanzar(0.1);
  return { partida, cliente, fauna, textos, asa: p.id, yo: `j${cliente.id}` };
}

const pegar = (partida, cliente, id, dano = 3) => partida.recibir(cliente.id, {
  t: MENSAJE.PEGAR, id, dano, alcance: 100000, cubo: "swordsmanship.power", tipo: "slash",
});

/** «Fulano says,  "texto"» -> el texto, si lo dice ese. */
const dice = (textos, quien) => textos
  .map((t) => /^(.*) says, {2}"(.*)"$/.exec(t))
  .filter((m) => m && m[1] === quien).map((m) => m[2]);

test("pegar a un aldeano: grita, y el guardia que lo oye te toma de objetivo (el 94)",
  { skip: !HAY && `falta ${BICHOS} o ${GUIONES}` }, async (t) => {
    await t.test("el guardia a 3 m: te apunta, lo escribe donde lo lee su guion y dice su frase", async () => {
      const { partida, cliente, fauna, textos, asa, yo } = await montar([
        { script: "NPCs/default_human", escena: [1, 0, 0] },
        { script: "gatecity/guard", escena: [3, 0, 0] },
      ]);
      const guardia = fauna.manada.de(1);
      assert.equal(guardia.cazador.objetivo, null, "antes de pegar no tiene objetivo");
      const g = partida.interacciones.guionDe(guardia);
      assert.equal(g.guion.vars.get("NPCATK_TARGET"), "unset", "y su guion nace con `unset` (la guarda de :112)");

      await pegar(partida, cliente, 0);

      const gritos = dice(textos, "Commoner");
      assert.equal(gritos.length, 1, `el aldeano grita una vez: ${JSON.stringify(textos)}`);
      assert.ok(GRITOS.has(gritos[0]), `uno de los cuatro de base_civilian.script:11-14: «${gritos[0]}»`);
      assert.equal(guardia.cazador.objetivo, yo, "el cazador del guardia apunta al jugador que pegó");
      assert.equal(g.guion.vars.get("NPCATK_TARGET"), asa, "y `NPCATK_TARGET` es el asa del jugador");
      assert.equal(g.costuraCuenta.deFuera?.npcatk_settarget, 1, "por el puente de `_objetivoPedidoDeFuera`");
      const alto = dice(textos, "Gate City Guard");
      assert.equal(alto.length, 1, `el guardia habla una vez: ${JSON.stringify(textos)}`);
      assert.ok(ALTO.has(alto[0]), `una de las cuatro de guard.script:120-123: «${alto[0]}»`);
    });

    await t.test("al matar al aldeano: «You've slain Commoner», con `name.full` y no su nombre de variable", async () => {
      const { partida, cliente, fauna, textos, yo } = await montar([
        { script: "NPCs/default_human", escena: [1, 0, 0] },
        { script: "gatecity/guard", escena: [3, 0, 0] },
      ]);
      await pegar(partida, cliente, 0, 9999);
      assert.equal(fauna.manada.de(0).muerto, true);
      assert.equal(fauna.manada.de(1).cazador.objetivo, yo, "el guardia también viene (el golpe que mata pasa por `game_struck`)");
      assert.ok(textos.includes("You've slain Commoner"), `base_npc.script:192-197: ${JSON.stringify(textos)}`);
      assert.ok(!textos.some((x) => x.includes("game.monster")), "sin un nombre de variable en pantalla");
    });

    await t.test("CONTROL NEGATIVO: un guardia a 40 m (≈1 575 u > BG_MAX_HEAR_CIV) no viene; el grito sí sale", async () => {
      const { partida, cliente, fauna, textos } = await montar([
        { script: "NPCs/default_human", escena: [1, 0, 0] },
        { script: "gatecity/guard", escena: [40, 0, 0] },
      ]);
      await pegar(partida, cliente, 0);
      // El grito es el control positivo del instrumento: la cadena llegó hasta
      // el `callexternal`, y lo que la corta es la distancia.
      assert.equal(dice(textos, "Commoner").length, 1, "el aldeano grita");
      assert.equal(fauna.manada.de(1).cazador.objetivo, null, "el guardia lejos no te apunta");
      assert.equal(dice(textos, "Gate City Guard").length, 0, "ni habla");
    });

    await t.test("CONTROL NEGATIVO: pegar a un goblin junto al guardia no lo alerta", async () => {
      const { partida, cliente, fauna, textos } = await montar([
        { script: "monsters/goblin", escena: [1, 0, 0] },
        { script: "gatecity/guard", escena: [3, 0, 0] },
      ]);
      await pegar(partida, cliente, 0);
      assert.equal(fauna.manada.de(1).cazador.objetivo, null, "el guardia sigue sin objetivo");
      assert.equal(dice(textos, "Gate City Guard").length, 0, "y callado");
      // Y el control positivo: el golpe llegó al guion del goblin.
      const gg = partida.interacciones.guionesVivos.get(fauna.manada.de(0).id);
      assert.equal(gg?.costuraCuenta.recibidos.game_struck, 1, "el goblin recibió su `game_struck`");
    });

    await t.test("el guardia con objetivo no lo cambia por un aldeano (`if NPCATK_TARGET equals unset`, :112)", async () => {
      const { partida, cliente, fauna, textos } = await montar([
        { script: "NPCs/default_human", escena: [1, 0, 0] },
        { script: "gatecity/guard", escena: [3, 0, 0] },
      ]);
      await pegar(partida, cliente, 0);
      assert.equal(dice(textos, "Gate City Guard").length, 1);
      await pegar(partida, cliente, 0);
      assert.equal(dice(textos, "Commoner").length, 2, "el aldeano grita las dos veces");
      assert.equal(dice(textos, "Gate City Guard").length, 1, "el guardia sólo la primera");
    });
  });
