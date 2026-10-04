// LA DEFENSA DEL JUGADOR CON SERVIDOR — experimento 97, pieza E.
//
// Hasta el 96, con servidor, el daño de un bicho al jugador no pasaba por
// ninguna defensa: `Partida._bichoPega` restaba el número de la IA tal cual.
// En solitario el orden es el del motor (player.cpp:403-414): armadura y
// escudo (`Gear[i]->OwnerTakeDamage`), el daño negativo a cero y el parry de
// `CMSMonster::TraceAttack`. Esto comprueba que con servidor es LA MISMA regla
// —`defensaDelJugador`, src/play/escudo.js— y que lo que dice llega al cliente
// que recibe el golpe y a ningún otro.
//
// Se entra por la Partida de verdad: el golpe entra por `fauna.golpear`, que
// es el gancho que llama la manada cuando un bicho acierta (`Manada.cazar` y
// `_golpeDelGuion`), con un personaje fabricado por `tools/personaje.mjs`
// —«Veteran», el fénix puesto— en el almacén del servidor y elegido con
// `MENSAJE.ELEGIR`. El escudo se embraza con `MENSAJE.EMPUNAR` y se levanta
// con el botón `ATACAR2` de `MENSAJE.ORDENES`, que es por donde llegará del
// navegador. Nada de esto se construye a mano en la prueba (el 59).
//
// LAS TIRADAS se fijan con `partida.dadosDeDefensa` (los `dados` de
// `defensaDelJugador`): el parry de Veteran es 40 y para la mitad de los
// golpes, así que un control sin fijarlo mediría el sorteo (el 76).
//
// Necesita los horneados: objetos.json, objetosguion.json, jugador.json y
// efectosguion.json. Sin ellos se salta, y lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, BOTON } from "../src/red/protocolo.js";
import { RELACION } from "../src/bsp/razas.js";
import { POSTURA } from "../src/play/escudo.js";
import { fabricar } from "../tools/personaje.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const comun = (n) => join(RAIZ, "build/msr", n);
const NECESARIOS = ["objetos.json", "objetosguion.json", "jugador.json", "efectosguion.json"];
const faltan = NECESARIOS.filter((n) => !existsSync(comun(n)));
const SALTA = faltan.length ? `sin ${faltan.join(", ")}: npm run objetos, objetos:guion, efectos:guion y el horneado del jugador` : false;
const leer = (n) => JSON.parse(readFileSync(comun(n), "utf8"));
const H = SALTA ? null : {
  catalogo: leer("objetos.json"), objetosGuion: leer("objetosguion.json"),
  fichaDelJugador: leer("jugador.json"), efectos: leer("efectosguion.json"),
};

// ── un goblin quieto, que no ataca solo ────────────────────────────────────
//
// No hostil a propósito: el golpe lo da la prueba por `fauna.golpear`, con un
// número conocido. Si el goblin cazara por su cuenta, la vida bajaría por dos
// caminos y «bajó 9» no diría cuál (el 66).
const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 1, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72.1528, 0, 0] },
];
const GOBLIN = { x: 2 };
function censo() {
  return {
    mapa: "liso", unidadesPorMetro: 39.37,
    razas: [["goblin", {}], ["human", {}]],
    modelos: [{ clave: "goblin", carpeta: "bichos/goblin" }],
    colocados: [{
      clase: "msmonster_orcwarrior", script: "monsters/goblin", clave: "goblin",
      nombre: "Goblin", hp: 50, ancho: 32, alto: 60, parado: null, andando: "walk", piel: 0,
      escena: [GOBLIN.x, 0, 0], yaw: 0, luz: [16, 16, 11], hostil: false, relacion: RELACION.ALIADO,
      ia: {
        raza: "goblin", vida: 50, pasea: false, ancho: 32, alto: 60, andando: "walk",
        aciertos: { min: 100, max: 100 }, dano: { min: 6, max: 9 }, experiencia: 26, parry: 0,
      },
    }],
  };
}

function buzon() {
  const dentro = [];
  return {
    dentro, enviar: (t) => dentro.push(JSON.parse(t)), al: () => () => {},
    textos: () => dentro.filter((m) => m.t === MENSAJE.TEXTO).map((m) => m.texto),
    vaciar: () => { dentro.length = 0; },
  };
}

/**
 * La partida, con Ana (el personaje de `fabricar`, o una variante) y Beto (uno
 * recién creado). `variar` cambia el documento ANTES de guardarlo: es la única
 * forma de que el servidor tenga otro `puesto`, porque es él quien lo guarda.
 */
async function montar({ variar = null } = {}) {
  const mundo = await mundoLiso();
  const fauna = new Fauna({
    censo: censo(), mundo, azar: () => 0.5,
    secuenciasPorClave: new Map([["goblin", SECUENCIAS]]),
    cajasPorClave: new Map([["goblin", { min: [-16, -16, 0], max: [16, 16, 72] }]]),
  });
  const almacen = new AlmacenMemoria();
  const veterano = fabricar({ nombre: "Ana" });
  variar?.(veterano);
  await almacen.escribir(veterano);
  const partida = new Partida({
    mundo, almacen, fauna, ahora: () => 0, catalogo: H.catalogo,
    objetosGuion: H.objetosGuion, fichaDelJugador: H.fichaDelJugador, efectos: H.efectos,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.2, 0] } },
  });
  const bA = buzon(), bB = buzon();
  const ana = partida.conectar(bA, { nombre: "Ana" });
  const beto = partida.conectar(bB, { nombre: "Beto" });
  await partida.recibir(ana.id, { t: MENSAJE.ELEGIR, id: veterano.id });
  await partida.recibir(beto.id, { t: MENSAJE.CREAR, personaje: { nombre: "Beto", arma: "swords_rsword" } });
  const lista = bB.dentro.filter((m) => m.t === MENSAJE.LISTA).pop();
  const deBeto = lista.personajes.find((x) => x.nombre === "Beto");
  await partida.recibir(beto.id, { t: MENSAJE.ELEGIR, id: deBeto.id });
  bA.vaciar(); bB.vaciar();
  const goblin = partida.fauna.manada.de(0);
  // EL GOLPE, por el gancho de la manada. Devuelve lo que la manada usa para
  // el PARAM1 de `game_dodamage` (`{parado, dano}`).
  const pegar = (c, dano, tipo) => partida.fauna._arnes().golpear(goblin, Fauna.nombreDeJugador(c.id), dano, tipo);
  return { partida, ana, beto, bA, bB, goblin, pegar, veterano };
}

const SIN_PARRY = { parry: 0, acierto: 100 };
const casi = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-3, `${msg}: ${a} y no ${b}`);

test("la defensa del jugador con servidor", { skip: SALTA }, async (t) => {
  await t.test("CONTROL: sin armadura puesta, el golpe entra ENTERO (20 → 20)", async () => {
    // El MISMO personaje con el fénix en la mochila y no puesto: el guion corre
    // —la armadura recibe `game_takedamage` igual que en el motor— y su primera
    // línea, `if $get(ent_me,is_worn)`, lo corta (armor_base.script:193).
    const { partida, ana, pegar, bA } = await montar({ variar: (p) => { for (const o of p.objetos) delete o.puesto; } });
    partida.dadosDeDefensa = SIN_PARRY;
    const p = ana.sesion.personaje;
    const antes = p.vida;
    const r = pegar(ana, 20);
    assert.deepEqual(r, { parado: false, dano: 20 });
    casi(antes - p.vida, 20, "la vida baja");
    assert.ok(bA.textos().some((x) => /^Goblin hits you: 20\.0 damage\./.test(x)), bA.textos().join(" | "));
  });

  await t.test("con el fénix PUESTO el golpe se queda en el 45 % (20 → 9), y lo dice con el 9", async () => {
    const { partida, ana, pegar, bA } = await montar();
    partida.dadosDeDefensa = SIN_PARRY;
    const p = ana.sesion.personaje;
    const antes = p.vida;
    const r = pegar(ana, 20);
    assert.equal(r.parado, false);
    casi(r.dano, 9, "lo que devuelve a la manada");
    casi(antes - p.vida, 9, "la vida del personaje del SERVIDOR");
    const u = partida.defensa.ultimo;
    assert.deepEqual(u.armadura.piezas.map((x) => x.id), ["armor_pheonix55", "armor_helm_gray"],
      "las dos piezas puestas, en el orden de la mochila");
    // El yelmo gris NO protege del daño (el 96: no incluye `armor_base`).
    casi(u.armadura.piezas[1].antes, u.armadura.piezas[1].despues, "el yelmo no cambia el daño");
    assert.ok(bA.textos().some((x) => /^Goblin hits you: 9\.0 damage\./.test(x)), bA.textos().join(" | "));
    assert.ok(!bA.textos().some((x) => /hits you: 20\.0/.test(x)), "y no anuncia el daño de antes de la defensa");
  });

  await t.test("lo que se dice va a QUIEN recibe el golpe, y a Beto no le llega nada", async () => {
    const { partida, ana, beto, pegar, bA, bB } = await montar();
    partida.dadosDeDefensa = SIN_PARRY;
    pegar(ana, 20);
    assert.ok(bA.textos().some((x) => /hits you/.test(x)));
    assert.equal(bB.textos().length, 0, `a Beto: ${bB.textos().join(" | ")}`);
    // Y al revés: Beto, sin armadura, se lleva los 5 enteros y Ana no se
    // entera. (5 y no 20: un personaje recién creado tiene 15 de vida.)
    bA.vaciar();
    const vb = beto.sesion.personaje.vida;
    pegar(beto, 5);
    casi(vb - beto.sesion.personaje.vida, 5, "Beto sin armadura");
    assert.ok(bB.textos().some((x) => /^Goblin hits you: 5\.0 damage\./.test(x)), bB.textos().join(" | "));
    assert.equal(bA.textos().length, 0);
  });

  await t.test("EL PARRY: Veteran para con su espada, lo dice SU guion y no baja la vida", async () => {
    const { partida, ana, pegar, bA, bB } = await montar();
    // Valor de parry de Ana: `update_parry` con su Blood Drinker. Se fija la
    // tirada de parry por encima de la de acierto, que es lo que para.
    partida.dadosDeDefensa = { parry: 30, acierto: 12 };
    const p = ana.sesion.personaje;
    const antes = p.vida;
    const r = pegar(ana, 20);
    assert.deepEqual(r, { parado: true, dano: 0 });
    assert.equal(p.vida, antes);
    assert.ok(partida.defensa.ultimo.parry.valor > 0, `parry ${partida.defensa.ultimo.parry.valor}`);
    assert.ok(bA.textos().some((x) => x === "You parry the attack! ( 30 vs. 12 )"), bA.textos().join(" | "));
    assert.ok(!bA.textos().some((x) => /hits you/.test(x)), "un golpe parado no «te pega»");
    assert.equal(bB.textos().length, 0, "y a Beto no le llega");
    // CONTROL del mismo dado al revés: la tirada no llega y el golpe entra.
    partida.dadosDeDefensa = { parry: 5, acierto: 12 };
    const r2 = pegar(ana, 20);
    assert.equal(r2.parado, false);
  });

  await t.test("el parry de Beto, recién creado, es el de su arma y no para con una tirada baja", async () => {
    const { partida, beto, pegar } = await montar();
    partida.dadosDeDefensa = { parry: 0, acierto: 1 };
    const r = pegar(beto, 5);
    assert.equal(r.parado, false, "0 no pasa de 1");
  });

  await t.test("EL ESCUDO: se embraza con EMPUNAR, se levanta con ATACAR2 y para de frente", async () => {
    const { partida, ana, pegar, bA } = await montar({ variar: (p) => p.objetos.push({ id: "shields_wooden", n: 1 }) });
    partida.dadosDeDefensa = { ...SIN_PARRY, arriba: 1, abajo: 100 };
    await partida.recibir(ana.id, { t: MENSAJE.EMPUNAR, id: "shields_wooden", mano: "izquierda" });
    const p = ana.sesion.personaje;
    assert.equal(p.manos.izquierda, "shields_wooden");
    assert.ok(!p.objetos.some((o) => o.id === "shields_wooden"), "sale de la mochila");
    // Mirando al goblin (+x): el «adelante» es (-sin yaw, 0, -cos yaw).
    const mira = -Math.PI / 2;
    let seq = 0;
    const ordenes = async (botones, n = 30) => {
      const lote = [];
      for (let k = 0; k < n; k++) lote.push({ seq: ++seq, msec: 10, yaw: mira, botones });
      await partida.recibir(ana.id, { t: MENSAJE.ORDENES, ordenes: lote });
      partida.avanzar(0.35);
    };
    await ordenes(BOTON.ATACAR2);
    assert.equal(ana.brazal?.postura, POSTURA.ARRIBA, "el botón de la otra mano lo levanta en el SERVIDOR");
    const antes = p.vida;
    const r = pegar(ana, 20);
    // Fénix 0,45 y luego el escudo de madera arriba deja pasar el 60 %
    // (`DMG_BLOCK_UP`, shields_base.script): 20 × 0,45 × 0,6 = 5,4.
    casi(r.dano, 5.4, "armadura y escudo, en ese orden");
    casi(antes - p.vida, 5.4, "la vida");
    assert.equal(partida.defensa.ultimo.bloqueo.arriba, true);
    // Soltado: abajo, y la tirada de abajo (fijada a 1) lo DESVÍA entero.
    partida.dadosDeDefensa = { ...SIN_PARRY, arriba: 100, abajo: 1 };
    await ordenes(0);
    assert.equal(ana.brazal?.postura, POSTURA.ABAJO);
    bA.vaciar();
    const v2 = p.vida;
    const r2 = pegar(ana, 20);
    assert.equal(r2.dano, 0);
    assert.equal(p.vida, v2);
    assert.ok(bA.textos().includes("Deflected!"), bA.textos().join(" | "));
    // CONTROL del cono: de espaldas al goblin, ni arriba bloquea.
    partida.dadosDeDefensa = { ...SIN_PARRY, arriba: 1, abajo: 1 };
    const espaldas = Math.PI / 2;
    const lote = [];
    for (let k = 0; k < 30; k++) lote.push({ seq: ++seq, msec: 10, yaw: espaldas, botones: BOTON.ATACAR2 });
    await partida.recibir(ana.id, { t: MENSAJE.ORDENES, ordenes: lote });
    partida.avanzar(0.35);
    const r3 = pegar(ana, 20);
    assert.equal(partida.defensa.ultimo.deFrente, false);
    assert.equal(partida.defensa.ultimo.bloqueo.bloquea, false, partida.defensa.ultimo.bloqueo.porque);
    casi(r3.dano, 9, "sólo la armadura");
  });

  await t.test("EMPUNAR a la izquierda sólo admite escudos, y lo que no lleva no entra", async () => {
    const { partida, ana, bA } = await montar();
    await partida.recibir(ana.id, { t: MENSAJE.EMPUNAR, id: "axes_dragon", mano: "izquierda" });
    assert.equal(ana.sesion.personaje.manos.izquierda, null);
    assert.match(bA.dentro.filter((m) => m.t === MENSAJE.FALLO).pop()?.porque ?? "", /not a shield axes_dragon/);
    await partida.recibir(ana.id, { t: MENSAJE.EMPUNAR, id: "shields_wooden", mano: "izquierda" });
    assert.equal(ana.sesion.personaje.manos.izquierda, null);
    assert.match(bA.dentro.filter((m) => m.t === MENSAJE.FALLO).pop()?.porque ?? "", /not carrying shields_wooden/);
  });

  await t.test("LA COSTURA CON `MENSAJE.VESTIR` (pieza F del 97): ponérsela por el cable protege, quitársela deja de proteger", async () => {
    // El 63: un fallo entre dos piezas verdes no lo ve ninguna de las dos. F
    // cambia la marca `puesto` del servidor; la defensa la tiene que leer en
    // el golpe SIGUIENTE, sin reiniciar nada (`_equipoDe` rehace la entidad).
    const { partida, ana, pegar } = await montar({ variar: (p) => { for (const o of p.objetos) delete o.puesto; } });
    partida.dadosDeDefensa = SIN_PARRY;
    const p = ana.sesion.personaje;
    let v = p.vida;
    casi(pegar(ana, 20).dano, 20, "antes de vestirse");
    casi(v - p.vida, 20, "la vida");
    await partida.recibir(ana.id, { t: MENSAJE.VESTIR, id: "armor_pheonix55", puesto: true });
    assert.equal(p.objetos.find((o) => o.id === "armor_pheonix55")?.puesto, true, "el servidor la marca puesta");
    v = p.vida;
    casi(pegar(ana, 20).dano, 9, "vestida por el cable");
    casi(v - p.vida, 9, "la vida");
    await partida.recibir(ana.id, { t: MENSAJE.VESTIR, id: "armor_pheonix55", puesto: false });
    casi(pegar(ana, 20).dano, 20, "y quitada, otra vez entero");
  });

  await t.test("el veneno de un EFECTO entra por la misma defensa: la armadura lo deja a la mitad", async () => {
    // `game_takedamage` de armor_base: si el tipo contiene «poison», × 0,5 en
    // vez del porcentaje (armor_base.script:191-238). Sin armadura, entero.
    const conA = await montar();
    conA.partida.dadosDeDefensa = SIN_PARRY;
    const p = conA.ana.sesion.personaje;
    const v = p.vida;
    conA.partida._efectoPega(conA.ana, { dano: 10, tipo: "poison_effect", atacante: { nombre: "Giant Rat" } });
    casi(v - p.vida, 5, "con el fénix");
    assert.ok(conA.bA.textos().some((x) => /^Giant Rat hits you: 5\.0 poison damage\./.test(x)), conA.bA.textos().join(" | "));
    const vb = conA.beto.sesion.personaje.vida;
    conA.partida._efectoPega(conA.beto, { dano: 10, tipo: "poison_effect", atacante: { nombre: "Giant Rat" } });
    casi(vb - conA.beto.sesion.personaje.vida, 10, "sin armadura");
  });

  await t.test("el tipo del `dodamage` de un guion llega a la defensa (`fauna.golpear` ya no lo tira)", async () => {
    const { partida, ana, pegar } = await montar();
    partida.dadosDeDefensa = { parry: 60, acierto: 1 };
    // Con «fire» el parry del motor NO para (msmonsterserver.cpp:2160-2177):
    // si el tipo se perdiera por el camino, la tirada fijada pararía.
    const r = pegar(ana, 10, "fire");
    assert.equal(r.parado, false, partida.defensa.ultimo.parry.porque);
    assert.equal(partida.defensa.ultimo.tipo, "fire");
  });
});
