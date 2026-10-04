// EL SERVIDOR HACE LO QUE YA HACE EL JUEGO EN SOLITARIO — experimento 98.
//
// Cuatro huecos que el 97 dejó apuntados (doc/DEFENSARED_97.md §5,
// doc/ATURDIR_97.md §6, doc/OVERRIDE_97.md §8):
//
//   1. las TRABAS de los efectos (aturdimiento, `effect_slow`) no se aplicaban
//      en `Partida._simular`;
//   2. la frase del parry DEL BICHO salía dos veces al que pegaba, y una a
//      cada uno de los demás;
//   3. los RELOJES de las piezas de armadura no corrían en el servidor;
//   4. `game_damaged` del jugador no lo llamaba nadie con servidor.
//
// Todo entra por la `Partida` de verdad (CLAUDE.md §4, el 59): personajes en
// el almacén del servidor y elegidos con `MENSAJE.ELEGIR`, el tiempo con
// `avanzar`, el cuerpo con `MENSAJE.ORDENES`, los golpes del jugador con
// `MENSAJE.PEGAR` y los del bicho por `fauna._arnes().golpear`, el gancho que
// llama la manada. Lo que se mira es lo que LLEGA a cada buzón (las fotos y
// los textos) y lo que el cuerpo del servidor anda.
//
// La única puerta que se abre a mano es la del aturdimiento: se aplica por
// `efectos.aplicar` del anfitrión, que es la puerta por la que lo mete el
// `applyeffect` de un guion de bicho (`aplicarEfecto` de la Partida), porque
// en estos mapas la IA no embiste todavía (doc/ATURDIR_97.md §6). Lo que se
// mide es quién LO LEE, no quién lo pone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, BOTON, abrir } from "../src/red/protocolo.js";
import { RELACION, leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { crearPersonaje } from "../src/juego/personaje.js";
import { fabricar } from "../tools/personaje.mjs";
import { cargarGuion } from "../tools/scriptsmsr.mjs";
import { trabasDe, juntarTrabas, trabasDelCable, trabasParaElCable, trabarIntencion } from "../src/play/trabas.js";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const comun = (n) => join(RAIZ, "build/msr", n);
const NECESARIOS = ["objetos.json", "objetosguion.json", "jugador.json", "efectosguion.json"];
const faltan = NECESARIOS.filter((n) => !existsSync(comun(n)));
const SALTA = faltan.length ? `sin ${faltan.join(", ")}` : false;
const HAY_MOD = existsSync(join(RAIZ, "../MSC/MSCScripts/scripts/monsters/giantrat.script"));
const leer = (n) => JSON.parse(readFileSync(comun(n), "utf8"));
const H = SALTA ? null : {
  catalogo: leer("objetos.json"), objetosGuion: leer("objetosguion.json"),
  fichaDelJugador: leer("jugador.json"), efectos: leer("efectosguion.json"),
};

const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 1, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
];

/** Un goblin quieto al alcance de la espada, que no caza: los golpes los da la prueba. */
function censoGoblin() {
  return {
    mapa: "liso", unidadesPorMetro: 39.37,
    razas: [["goblin", {}], ["human", {}]],
    modelos: [{ clave: "goblin", carpeta: "bichos/goblin" }],
    colocados: [{
      clase: "msmonster_orcwarrior", script: "monsters/goblin", clave: "goblin",
      nombre: "Goblin", hp: 50, ancho: 32, alto: 60, parado: null, andando: "walk", piel: 0,
      escena: [1, 0, 0], yaw: 0, luz: [16, 16, 11], hostil: false, relacion: RELACION.ALIADO,
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
    dentro, enviar: (t) => dentro.push(abrir(t)), al: () => () => {},
    textos: () => dentro.filter((m) => m.t === MENSAJE.TEXTO).map((m) => m.texto),
    fotos: () => dentro.filter((m) => m.t === MENSAJE.FOTO),
    sucesos: () => dentro.filter((m) => m.t === MENSAJE.FOTO).flatMap((m) => m.sucesos ?? []),
    vaciar: () => { dentro.length = 0; },
  };
}

/** La fuerza de un personaje recién creado: muy por debajo de los 40 del fénix. */
const debil = (p) => { p.habilidades = crearPersonaje({ nombre: "x" }).habilidades; };

/**
 * Ana es «Veteran» de `tools/personaje.mjs` (el fénix y el yelmo PUESTOS),
 * con `variar` aplicado antes de guardarla —es el servidor quien la guarda—.
 * Beto, uno recién creado y sin nada puesto: el control de reparto.
 */
async function montar({ variar = null, censo = censoGoblin(), fauna: conFauna = true, guiones = null, secuencias = SECUENCIAS, caja = null } = {}) {
  const mundo = await mundoLiso();
  const clave = censo.colocados[0].clave;
  const fauna = conFauna ? new Fauna({
    censo, mundo, azar: () => 0.5,
    secuenciasPorClave: new Map([[clave, secuencias]]),
    cajasPorClave: new Map([[clave, caja ?? { min: [-16, -16, 0], max: [16, 16, 72] }]]),
  }) : null;
  const almacen = new AlmacenMemoria();
  const veterano = fabricar({ nombre: "Ana" });
  variar?.(veterano);
  await almacen.escribir(veterano);
  const partida = new Partida({
    mundo, almacen, fauna, ahora: () => 0, catalogo: H.catalogo,
    objetosGuion: H.objetosGuion, fichaDelJugador: H.fichaDelJugador, efectos: H.efectos,
    guiones,
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
  const seqs = new Map();
  /**
   * `segundos` de órdenes de 10 ms con la intención dada, a lotes de 0,1 s
   * con el mundo avanzando entre lote y lote, como llegan del navegador (y
   * sin adelantar el reloj del cliente: `SV_CheckCmdTimes`). Devuelve la
   * rapidez del cuerpo del SERVIDOR al final, en u/s.
   */
  const andar = async (c, segundos, { adelante = 1, botones = 0 } = {}) => {
    let seq = seqs.get(c.id) ?? 0;
    for (let k = 0; k < Math.round(segundos * 10); k++) {
      const lote = [];
      for (let j = 0; j < 10; j++) lote.push({ seq: ++seq, msec: 10, yaw: 0, cabeceo: 0, adelante, lado: 0, botones });
      await partida.recibir(c.id, { t: MENSAJE.ORDENES, ordenes: lote });
      partida.avanzar(0.1);
    }
    seqs.set(c.id, seq);
    return c.cuerpo.rapidez ?? 0;
  };
  /** El mundo sin órdenes, para que pase el tiempo de los relojes. */
  const pasar = (s) => { for (let k = 0; k < Math.round(s * 10); k++) partida.avanzar(0.1); };
  return { partida, ana, beto, bA, bB, andar, pasar };
}

const enRango = (v, a, b, msg) => assert.ok(v >= a && v <= b, `${msg}: ${v} fuera de [${a}, ${b}]`);

test("1 y 3: el fénix de un débil frena CON SERVIDOR, por su reloj y sus trabas", { skip: SALTA }, async (t) => {
  await t.test("CONTROL: Veteran (fuerza ≥ 40) anda libre, sin trabas en la foto", async () => {
    const { partida, ana, bA, andar } = await montar();
    const v = await andar(ana, 2);
    partida.repartir();
    assert.ok(v > 100, `libre anda ${v} u/s`);
    assert.equal(ana.trabas.porcentaje, 0);
    assert.ok(!bA.fotos().some((f) => f.trabas), "ninguna foto lleva trabas");
    assert.ok(!bA.textos().some((x) => /slowed/.test(x)));
  });

  await t.test("débil con el fénix PUESTO: el reloj de la pieza corre aquí y la lentitud frena aquí", async () => {
    const { partida, ana, beto, bA, bB, andar } = await montar({ variar: debil });
    // `game_wear` → `callevent 0.1 failed_str_req_loop` (armor_base.script:100):
    // el reloj de la pieza tiene que correr para que haya lentitud.
    const v = await andar(ana, 2);
    const fila = partida.costura().efectos.find((e) => e.cliente === ana.id);
    assert.ok(fila.piezas.some((p) => p.id === "armor_pheonix55" && p.puesto), JSON.stringify(fila.piezas));
    assert.equal(fila.trabas?.porcentaje, 50, JSON.stringify(fila.trabas));
    assert.equal(fila.trabas?.noSaltar, true);
    // `min(fSpeed × 0,5, 50)` (src/play/trabas.js). Cargada, fSpeed es 91,3
    // (ver el caso de la mochila), así que manda el 50 %: 45,7.
    enRango(v, 44, 47, "lento con servidor");
    // Lo dicen los guiones del servidor, a SU consola: el `infomsg` de la pieza
    // (tipo −2) y el «You are being slowed.» del efecto. Una vez, no dos.
    const avisos = bA.dentro.filter((m) => m.t === MENSAJE.TEXTO && m.tipo === -2 && /Insufficient Strength/.test(m.titulo ?? ""));
    assert.equal(avisos.length, 1, `avisos de fuerza: ${avisos.length}`);
    assert.equal(bA.textos().filter((x) => /You are being slowed/.test(x)).length, 1, bA.textos().join(" | "));
    assert.ok(!bB.textos().some((x) => /slowed|Strength/.test(x)), "a Beto no le llega");
    // Las trabas viajan en la foto de Ana (su `clientdata`), no en la de Beto.
    partida.repartir();
    const fA = bA.fotos().at(-1), fB = bB.fotos().at(-1);
    assert.deepEqual(fA.trabas, { porcentaje: 50, noSaltar: true, ritmoAnim: 0.5 });
    assert.equal(fB.trabas, undefined);
    // Y Beto, en la misma partida, anda libre: las trabas son de quien las lleva.
    const vB = await andar(beto, 2);
    assert.ok(vB > 100, `Beto anda ${vB}`);
  });

  await t.test("los relojes de las piezas no dan anfitrión a quien no lleva piezas (el control de Beto)", async () => {
    // `costura().efectos` es «a quién le ha caído un efecto o tiene piezas que
    // corren aquí». La primera versión pedía el anfitrión en cada paso para
    // todos y `sondas/costurared92` (su control negativo, Beto) se puso rojo.
    const { partida, ana, beto, pasar } = await montar();
    pasar(1);
    const filas = partida.costura().efectos.map((e) => e.cliente);
    assert.ok(filas.includes(ana.id), "Ana, con el fénix, sí");
    assert.ok(!filas.includes(beto.id), `Beto, sin nada puesto, no: ${JSON.stringify(filas)}`);
  });

  await t.test("débil con el fénix PUESTO no salta con servidor (NOJUMP)", async () => {
    const { ana, andar, pasar } = await montar({ variar: debil });
    pasar(0.5);
    const y0 = ana.cuerpo.feet[1];
    let maxY = y0;
    for (let k = 0; k < 6; k++) { await andar(ana, 0.1, { adelante: 0, botones: BOTON.SALTAR }); maxY = Math.max(maxY, ana.cuerpo.feet[1]); }
    assert.ok(maxY - y0 < 0.05, `subió ${maxY - y0} m`);
  });

  await t.test("CONTROL del salto: Veteran sí salta con el mismo botón", async () => {
    const { ana, andar, pasar } = await montar();
    pasar(0.5);
    const y0 = ana.cuerpo.feet[1];
    let maxY = y0;
    for (let k = 0; k < 6; k++) { await andar(ana, 0.1, { adelante: 0, botones: BOTON.SALTAR }); maxY = Math.max(maxY, ana.cuerpo.feet[1]); }
    assert.ok(maxY - y0 > 0.5, `subió ${maxY - y0} m`);
  });

  await t.test("el bucle es de diez segundos: dos vueltas en 21 s son dos avisos, no cuatro", async () => {
    const { bA, pasar } = await montar({ variar: debil });
    pasar(21);
    const avisos = bA.dentro.filter((m) => m.t === MENSAJE.TEXTO && m.tipo === -2 && /Insufficient Strength/.test(m.titulo ?? ""));
    assert.equal(avisos.length, 3, `0,1 s + 10 + 20: ${avisos.length}`);
  });

  await t.test("con el fénix en la MOCHILA (no puesto) no hay bucle ni lentitud", async () => {
    const { ana, bA, andar } = await montar({ variar: (p) => { debil(p); for (const o of p.objetos) delete o.puesto; } });
    // Cargada anda 91,3 u/s (el castigo de peso, playershared.cpp:1017-1026:
    // el fénix pesa 120 y ella tiene fuerza de recién creada). Sin lentitud
    // sería ~45 (la mitad); por encima de 80 es que no hay.
    const v = await andar(ana, 2);
    assert.ok(v > 80, `anda ${v}`);
    assert.ok(!bA.textos().some((x) => /slowed/.test(x)));
  });
});

test("1: el aturdimiento con servidor frena, no deja saltar y no deja pegar", { skip: SALTA }, async (t) => {
  await t.test("aturdido: 45 u/s, PEGAR rechazado; a los tres segundos, libre", async () => {
    const { partida, ana, bA, andar } = await montar();
    // La puerta del `applyeffect` de un guion de bicho (`aplicarEfecto` de
    // la Partida): `applyeffect ent_laststruckbyme effects/debuff_stun 3 …`
    // (boar_base.script:183). Sin yelmo en la cabeza no se resiste nunca.
    const host = partida._efectosDe(ana);
    for (const o of ana.sesion.personaje.objetos) delete o.puesto;
    host.efectos.aplicar("effects/debuff_stun", ["3", "0"]);
    assert.ok(bA.textos().some((x) => /You have been stunned/.test(x)), bA.textos().join(" | "));
    const v = await andar(ana, 1);
    enRango(v, 40, 45.5, "aturdido con servidor");
    assert.equal(ana.trabas.noAtacar, true);
    await partida.recibir(ana.id, { t: MENSAJE.PEGAR, id: 0, dano: 5, alcance: 60, tipo: "slash" });
    assert.equal(partida.fauna.manada.de(0).vida, 50, "el goblin no recibe nada");
    partida.repartir();
    assert.ok(bA.sucesos().some((s) => s.que === "tupegas" && s.trabado), "el cliente sabe por qué");
    const v2 = await andar(ana, 3);
    assert.equal(ana.trabas.noAtacar, false, "se pasa");
    assert.ok(v2 > 100, `libre otra vez ${v2}`);
    // CONTROL POSITIVO del rechazo: el mismo PEGAR, ya libre, sí entra (el
    // goblin está al alcance; si no, el cero de arriba no diría nada).
    // Vuelve a su sitio: andar tres segundos la ha llevado lejos.
    ana.cuerpo.colocar?.([0, 0.2, 0]);
    await partida.recibir(ana.id, { t: MENSAJE.PEGAR, id: 0, dano: 5, alcance: 60, tipo: "slash" });
    assert.ok(partida.fauna.manada.de(0).vida < 50, `libre pega: vida ${partida.fauna.manada.de(0).vida}`);
  });
});

test("4: `game_damaged` con servidor", { skip: SALTA }, async (t) => {
  await t.test("al que recibe le llega `golpeado` (para su guion del navegador) y a nadie más", async () => {
    const { partida, ana, beto, bA, bB } = await montar({ variar: (p) => { for (const o of p.objetos) delete o.puesto; } });
    partida.dadosDeDefensa = { parry: 0, acierto: 100 };
    const goblin = partida.fauna.manada.de(0);
    partida.fauna._arnes().golpear(goblin, Fauna.nombreDeJugador(ana.id), 12, "blunt");
    partida.repartir();
    const g = bA.sucesos().filter((s) => s.que === "golpeado");
    assert.equal(g.length, 1, JSON.stringify(bA.sucesos()));
    assert.equal(g[0].atacante, "Goblin");
    assert.equal(g[0].dano, 12);
    assert.equal(g[0].tipo, "blunt");
    assert.equal(bB.sucesos().filter((s) => s.que === "golpeado").length, 0, "MSG_ONE");
    assert.equal(partida.defensa.danados, 1);
    // Un golpe PARADO no es un golpe que entra: ni `golpeado` (como `golpear`).
    partida.dadosDeDefensa = { parry: 80, acierto: 1 };
    partida.fauna._arnes().golpear(goblin, Fauna.nombreDeJugador(beto.id), 12, "blunt");
    partida.repartir();
    assert.equal(bB.sucesos().filter((s) => s.que === "golpeado").length, 0);
  });

  await t.test("los EFECTOS del anfitrión del servidor lo reciben: la protección hace su fundido", async () => {
    // `effects/protection` responde a `game_damaged` con `effect screenfade`
    // (protection.script:26-31), que viaja como `MENSAJE.PANTALLA` (el 93).
    const { partida, ana, bA } = await montar({ variar: (p) => { for (const o of p.objetos) delete o.puesto; } });
    partida.dadosDeDefensa = { parry: 0, acierto: 100 };
    partida._efectosDe(ana).efectos.aplicar("effects/protection", ["30", "0.5"]);
    const antes = bA.dentro.filter((m) => m.t === MENSAJE.PANTALLA && m.que === "fundido").length;
    partida.fauna._arnes().golpear(partida.fauna.manada.de(0), Fauna.nombreDeJugador(ana.id), 10, "blunt");
    const despues = bA.dentro.filter((m) => m.t === MENSAJE.PANTALLA && m.que === "fundido").length;
    assert.equal(despues - antes, 1, `fundidos: ${antes} → ${despues}`);
  });
});

test("2: la frase del parry DEL BICHO con servidor", { skip: (SALTA || !HAY_MOD) && "faltan horneados o ../MSC" }, async (t) => {
  /** Una rata del mod con su guion y parry alto: para casi siempre. */
  async function conRata({ guiones = true } = {}) {
    const RATA = "monsters/giantrat";
    const ficha = modeloYAnimaciones(leerFichaNpc(join(RAIZ, "../MSC/MSCScripts/scripts"), RATA));
    const censo = {
      mapa: "liso", unidadesPorMetro: 39.37, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
      colocados: [{
        clase: "msmonster_giantrat", script: RATA, clave: "b", nombre: ficha.nombre ?? "Giant Rat", hp: 1000,
        ancho: ficha.ancho, alto: ficha.alto, parado: "idle1", andando: "walk", piel: 0,
        escena: [-1.0, 0, 0], yaw: 0, luz: [0, 0, 0], hostil: false,
        relacion: ficha.relacion ?? RELACION.RECELO, ia: { ...ficha.ia, vida: 1000, parry: 80 },
      }],
    };
    return montar({
      variar: (p) => { for (const o of p.objetos) delete o.puesto; },
      censo, guiones: guiones ? { guiones: { [RATA]: cargarGuion(RATA) } } : null,
      caja: { min: [-16, -16, 0], max: [16, 16, 32] },
    });
  }
  const pegarHastaParar = async (m, n = 40) => {
    const rata = m.partida.fauna.manada.instancias[0];
    let parados = 0;
    for (let k = 0; k < n && parados < 3; k++) {
      const r = await m.partida.recibir(m.ana.id, { t: MENSAJE.PEGAR, id: rata.id, dano: 1, alcance: 60, cubo: "swordsmanship.0", tipo: "slash" });
      if (r?.parado) parados++;
      m.partida.avanzar(0.05);
    }
    m.partida.repartir();
    return parados;
  };

  await t.test("con guion: `tupegas` dice `hablaElGuion`, la frase del guion llega SÓLO al que pegó", async () => {
    const m = await conRata();
    const parados = await pegarHastaParar(m);
    assert.ok(parados >= 1, "la rata con parry 80 tiene que parar alguna");
    const tp = m.bA.sucesos().filter((s) => s.que === "tupegas" && s.parado);
    assert.equal(tp.length, parados);
    assert.ok(tp.every((s) => s.hablaElGuion === true), JSON.stringify(tp.map((s) => s.hablaElGuion)));
    // `playermessage $get(PARAM1,id) Your attack was PARRY_TYPE`
    // (base_monster_shared.script:472-475): UNA línea por parada, a Ana.
    const frasesA = m.bA.textos().filter((x) => /^Your attack was/.test(x));
    assert.equal(frasesA.length, parados, frasesA.join(" | "));
    assert.equal(m.bB.textos().filter((x) => /Your attack was/.test(x)).length, 0, "Beto no pegó");
    // El `para` sigue llegando a todos (cuenta y animación), y no lleva frase.
    assert.ok(m.bB.sucesos().some((s) => s.que === "para"));
  });

  await t.test("CONTROL: sin guiones en el servidor, `hablaElGuion` es falso y el relevo es del cliente", async () => {
    const m = await conRata({ guiones: false });
    const parados = await pegarHastaParar(m);
    assert.ok(parados >= 1);
    const tp = m.bA.sucesos().filter((s) => s.que === "tupegas" && s.parado);
    assert.ok(tp.every((s) => !s.hablaElGuion));
    assert.equal(m.bA.textos().filter((x) => /Your attack was/.test(x)).length, 0, "nadie lo dice en el servidor");
  });
});

// ── el navegador junta las suyas con las del cable ──────────────────────────

test("1: las trabas del cable y las del navegador se juntan como UNA lista de guiones", () => {
  // Un guion de mentira con la interfaz que lee `trabasDe` (`resolver`/`existeVar`).
  const efecto = (vars) => ({ guion: { resolver: (n) => vars[n] ?? n, existeVar: (n) => n in vars }, esEfecto: true });
  const lento = trabasDe([efecto({ "game.effect.movespeed": "50%", "game.effect.canjump": "0" })]);
  const veneno = trabasDe([efecto({ "game.effect.movespeed": "90", "game.effect.canduck": "0" })]);
  const lista = trabasDe([
    efecto({ "game.effect.movespeed": "50%", "game.effect.canjump": "0" }),
    efecto({ "game.effect.movespeed": "90", "game.effect.canduck": "0" }),
  ]);
  // Por el cable y de vuelta, y juntadas: lo mismo que si fueran una lista.
  const j = juntarTrabas(lento, trabasDelCable(trabasParaElCable(veneno)));
  assert.equal(j.porcentaje, lista.porcentaje);
  assert.equal(j.porcentaje, 45);
  assert.equal(j.noSaltar, true);
  assert.equal(j.noAgachar, true);
  // Sin nada en el cable no viaja nada, y juntar con nada no cambia nada.
  assert.equal(trabasParaElCable(trabasDe([])), null);
  assert.equal(juntarTrabas(lento, null), lento);
  // Y lo que quitan, en el sitio de los dos lados.
  const q = trabarIntencion({ adelante: 1, lado: 1, correr: true, saltar: true, agachar: true, atacar: true, cubrir: true }, j);
  assert.deepEqual(q, { adelante: 1, lado: 1, correr: true, saltar: false, agachar: false, atacar: true, cubrir: true });
});
