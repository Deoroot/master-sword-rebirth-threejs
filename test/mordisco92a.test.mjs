// EL MORDISCO DEL 92: el daño de un bicho sale del EVENTO DE ANIMACIÓN, como en el mod.
//
// En Master Sword la IA de un monstruo no hace daño: pone la animación de
// atacar, y es el `.mdl` el que, en el fotograma del mordisco, llama al guion
// por su nombre (evento 500/600, msmonsterserver.cpp:1484-1493). Ese evento
// —`bite1` en giantrat.script:63-67— hace `dodamage`, y el motor le contesta
// con `game_dodamage` y, si el ataque trae `dmgevent:`, con `<evento>_dodamage`
// (giattack.cpp:2030-2058). Por ahí envenena la araña de las cloacas
// (`bite_dodamage`, spider_mini_poison.script:51-54).
//
// TODO ENTRA POR DONDE ENTRA EL JUEGO (CLAUDE.md §4, el 59 y el 63): una
// `Manada` de verdad, un `InteraccionesNpc` de verdad enchufado con
// `enchufarA`, el tiempo con `relojes` + `cazar` como `src/main.js`. Nadie
// llama a `eventosDeAnimacion`, a `_golpeDelGuion` ni a `costura` a mano, ni
// construye el `dodamage`: lo parte el analizador del guion del MOD.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones, RELACION } from "../src/bsp/script.js";
import { Manada, EVENTOS_QUE_LLAMAN_AL_GUION } from "../src/play/manada.js";
import { InteraccionesNpc } from "../src/juego/interacciones.js";
import { cargarGuion } from "../tools/scriptsmsr.mjs";
import { eventosDeSecuencia } from "../tools/bicho.mjs";
import { eventosDeModelo } from "../tools/bichosguion.mjs";
import { leerMdl } from "../src/bsp/mdl.js";
import { leerSecuencias } from "../src/bsp/mdlanim.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const HAY_MOD = existsSync(SCRIPTS);
const HAY_MODELOS = existsSync(MODELOS);
const U = 39.37;
const DT = 1 / 60;

/** Un dado fijo, para que dos pasadas den lo mismo. */
function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Las secuencias de un bicho de prueba. El ataque dura 1 s (30 fotogramas a
 * 30) y, si se pide, trae el evento del modelo en el fotograma 14 — los
 * números de verdad de `monsters/giant_rat.mdl` (medido: `attack f14 ev600
 * 'bite1'`).
 */
function secuencias({ evento = null, frame = 14, codigo = 600, enReposo = null } = {}) {
  return [
    { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 15, avance: [0, 0, 0],
      eventos: enReposo ? [{ frame: 5, evento: 500, opciones: enReposo }] : [] },
    { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0], eventos: [] },
    { indice: 2, nombre: "run", fps: 30, fotogramas: 25, bucle: true, actividad: 4, pesoActividad: 1, avance: [76, 0, 0], eventos: [] },
    { indice: 3, nombre: "attack", fps: 30, fotogramas: 30, bucle: false, actividad: 28, pesoActividad: 1, avance: [0, 0, 0],
      eventos: evento ? [{ frame, evento: codigo, opciones: evento }] : [] },
    { indice: 4, nombre: "die", fps: 30, fotogramas: 40, bucle: false, actividad: 36, pesoActividad: 1, avance: [0, 0, 0], eventos: [] },
  ];
}

/**
 * Un bicho del mod y un jugador a `lejos.aU` unidades (se puede mover a
 * mitad de prueba), con la costura enchufada como la enchufa `src/main.js`.
 * La animación de ataque se llama `attack` en las secuencias de prueba.
 */
function montar(script, {
  evento = null, frame = 14, codigo = 600, enReposo = null, aU = 30, azar = dado(5),
  relacion = RELACION.ODIO, defensa = null, enchufar = true, postspawn = null, hp = null, pasea = null,
  // EL 93: las secuencias DEL MODELO de verdad, para el bicho cuyo guion pide
  // animaciones que las de prueba no traen (el salto de la araña: `jumpmiss`
  // y su `frame_jump`). Sin ellas `buscarSecuencia` cae en la 0, el evento no
  // sale nunca y la araña se queda a medio salto para siempre.
  reales = null,
} = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, script));
  const guion = cargarGuion(script);
  const lejos = { aU, alto: 36 };
  const manada = new Manada({
    mapa: "liso", unidadesPorMetro: U,
    razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_x", script, clave: "b",
      nombre: ficha.nombre ?? script, hp: hp ?? ficha.hp ?? 10, ancho: ficha.ancho, alto: ficha.alto,
      parado: "idle1", andando: "walk", piel: 0,
      escena: [0, 0, 0], yaw: 0, luz: [0, 0, 0],
      hostil: true, relacion,
      ...(postspawn ? { postspawn } : {}),
      ia: { ...ficha.ia, golpe: "attack", ...(hp ? { vida: hp } : {}), ...(pasea === null ? {} : { pasea }) },
    }],
  }, {
    secuenciasPorClave: new Map([["b", reales ?? secuencias({ evento, frame, codigo, enReposo })]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 32] }]]),
    azar,
  });
  const personaje = { id: "P1", nombre: "Ana", vida: 1000 };
  const i = manada.instancias[0];
  const pies = () => [i.donde[0] + lejos.aU / U, i.donde[1], i.donde[2]];
  const efectos = [];
  const inter = new InteraccionesNpc({
    sesion: { personaje },
    guiones: { guiones: { [script]: guion } },
    npcPorId: (id) => manada.de(id),
    suceso: () => {},
    losNpc: () => manada.instancias,
    dondeEstaElJugador: pies,
    unidadesPorMetro: U,
    // EL 93: el `playanim` del guion llega a la manada como en `src/main.js`
    // (`animar: (instancia, nombre) => bichos.deUnaVez(instancia, nombre)`).
    // Hasta el 92 este arnés no lo enchufaba, y ningún guion de esta prueba
    // movía la animación: con el salto de la araña eso deja el `frame_jump`
    // sin salir, que es otro juego (el 59: el arnés tiene que ser el del jugador).
    // EL 94: con el modo, como `src/main.js` (`bichos.playanim`); antes,
    // `manada.deUnaVez(inst, nombre)`, que hacía `critical` de todo.
    animar: (inst, nombre, modo) => manada.playanim(inst, nombre, modo),
    // El anfitrión de efectos es el jugador (`main.js`); aquí se apunta qué
    // llega y con qué aplicador, que es lo que decide el «X hits you».
    aplicarEfecto: (ruta, params, o) => { efectos.push({ ruta, params: [...params], aplicador: o?.aplicador ?? null, t: manada.t }); return {}; },
  });
  if (enchufar) inter.enchufarA(manada);
  const golpes = [];
  const arnes = {
    libre: () => true,
    suelo: () => 0,
    veA: () => true,
    objetivos: (b) => {
      const n = b.donde;
      return [{ id: "jugador", donde: [n[0] * U + lejos.aU, n[1] * U + lejos.alto, n[2] * U], esJugador: true, relacion, ancho: 0 }];
    },
    // Los CUATRO parámetros de `golpear` de main.js: el cuarto, el tipo, sólo
    // lo pasa el golpe del guion (el de la IA deja el del bicho por omisión).
    golpear: (_b, id, dano, tipo) => {
      golpes.push({ id, dano, tipo, t: manada.t, nArgs: tipo === undefined ? 3 : 4 });
      return defensa ? defensa(dano) : { parado: false, dano };
    },
  };
  // Lo que se ve en el juego: la animación de ataque y cuándo se puso.
  const ataques = [];
  let gen = i.anim.gen;
  const paso = () => {
    manada.relojes(DT);
    manada.cazar(DT, arnes);
    inter.paso(DT);
    if (i.anim.gen !== gen) { gen = i.anim.gen; if (i.anim.nombre === "attack") ataques.push(manada.t); }
  };
  const correr = (segundos) => { for (let t = 0; t < segundos; t += DT) paso(); };
  const g = () => inter.guionesVivos.get(i.id) ?? null;
  const recibidos = () => ({ ...(g()?.costuraCuenta?.recibidos ?? {}) });
  return { manada, inter, i, correr, paso, golpes, ataques, efectos, lejos, g, recibidos, personaje };
}

/** EL 93: las secuencias de un `.mdl` de verdad, con la forma del horneado. */
function secuenciasDelModelo(relativo) {
  const m = leerMdl(`${MODELOS}/${relativo}`);
  return leerSecuencias(m).map((s, k) => ({
    indice: k, nombre: s.nombre, fps: s.fps, fotogramas: Math.max(1, s.nFotogramas), bucle: s.bucle,
    actividad: s.actividad, pesoActividad: s.pesoActividad, avance: s.avance, eventos: eventosDeSecuencia(m, k),
  }));
}

// ── EL HORNEADO ─────────────────────────────────────────────────────────────

describe("el horneado trae los eventos de cada secuencia", { skip: !HAY_MODELOS }, () => {
  const MDL = ["monsters/giant_rat", "monsters/spider", "monsters/fer_spider_mini", "monsters/goblin_new", "dwarf/male1"];
  test("`eventosDeSecuencia` (por índice) y `eventosDeModelo` (el censo del 91) leen lo mismo, sin los del cliente", () => {
    for (const nombre of MDL) {
      const ruta = `${MODELOS}/${nombre}.mdl`;
      const m = leerMdl(ruta);
      const porIndice = leerSecuencias(m).flatMap((s, k) => eventosDeSecuencia(m, k).map((e) => ({ secuencia: s.nombre, ...e })));
      const delCenso = eventosDeModelo(readFileSync(ruta)).filter((e) => e.evento < 5000);
      assert.deepEqual(porIndice, delCenso, nombre);
      assert.ok(porIndice.every((e) => e.evento < 5000), `${nombre}: ninguno del cliente (EVENT_CLIENT, monsterevent.h:27)`);
    }
  });
  test("la rata: `attack` llama a `bite1` en el fotograma 14 con el código 600", () => {
    const m = leerMdl(`${MODELOS}/monsters/giant_rat.mdl`);
    const k = leerSecuencias(m).findIndex((s) => s.nombre === "attack");
    assert.deepEqual(eventosDeSecuencia(m, k), [{ frame: 14, evento: 600, opciones: "bite1" }]);
  });
  test("el `bicho.json` horneado de sala88 los lleva (si está horneado)", { skip: !existsSync("build/sala88/bichos/monsters_giant_rat/bicho.json") }, () => {
    const f = JSON.parse(readFileSync("build/sala88/bichos/monsters_giant_rat/bicho.json", "utf8"));
    const a = f.secuencias.find((s) => s.nombre === "attack");
    assert.ok(Array.isArray(a?.eventos), "sin `eventos`: el horneado es de antes del 92 (`npm run mapa:bichos -- --mapa sala88`)");
    assert.ok(a.eventos.some((e) => e.opciones === "bite1" && EVENTOS_QUE_LLAMAN_AL_GUION.has(e.evento)));
  });
});

// ── LA RATA: EL DAÑO SALE DE `bite1` ───────────────────────────────────────

describe("la rata muerde desde `bite1`, y la IA no tira su dado", { skip: !HAY_MOD }, () => {
  test("cada golpe que llega al jugador es un `bite1` que entró: ni uno de la IA, ni dos por ataque", () => {
    const r = montar("monsters/giantrat", { evento: "bite1" });
    r.correr(12);
    const c = r.manada.golpesDelGuion;
    assert.ok(c.atacaPorGuion >= 5, `la IA ha decidido atacar y le ha dejado el daño al guion: ${JSON.stringify(c)}`);
    assert.ok(r.golpes.length >= 2, `y algún mordisco ha entrado: ${r.golpes.length}`);
    assert.equal(r.golpes.length, c.entran, "un `golpear` por cada `dodamage` que entra");
    assert.equal(r.golpes.length, r.recibidos().game_damaged_other, "y su `game_damaged_other`, uno cada uno");
    assert.ok(r.golpes.every((x) => x.nArgs === 4 && x.tipo === "generic"),
      `el tipo es el del \`dodamage\`, «generic» sin quinto parámetro (npcscript.cpp:1116): ${JSON.stringify(r.golpes.map((x) => x.tipo))}`);
    assert.equal(r.recibidos().bite1, c.eventos, "cada evento del modelo llegó al guion por su nombre");
    // Un ataque, como mucho un golpe: con el daño de la IA Y el del guion
    // saldrían dos por ataque.
    assert.ok(r.golpes.length <= r.ataques.length, `${r.golpes.length} golpes en ${r.ataques.length} ataques`);
  });

  test("el mordisco llega en el FOTOGRAMA 14, no cuando la IA decide atacar", () => {
    const r = montar("monsters/giantrat", { evento: "bite1", azar: dado(9) });
    r.correr(12);
    assert.ok(r.golpes.length >= 1);
    for (const gpe of r.golpes) {
      const empezo = r.ataques.filter((t) => t <= gpe.t + 1e-9).at(-1);
      const tarde = gpe.t - empezo;
      // 14/30 = 0,467 s; se mira cada vuelta de 1/60, así que llega en la
      // primera vuelta que pasa el fotograma.
      assert.ok(tarde >= 14 / 30 - 1e-6 && tarde <= 14 / 30 + DT + 1e-6, `llegó ${tarde.toFixed(3)} s después de empezar el ataque`);
    }
  });

  test("con el evento en otro fotograma, el mordisco se mueve con él (el número es la regla)", () => {
    const r = montar("monsters/giantrat", { evento: "bite1", frame: 24, azar: dado(9) });
    r.correr(12);
    assert.ok(r.golpes.length >= 1);
    const gpe = r.golpes[0];
    const empezo = r.ataques.filter((t) => t <= gpe.t + 1e-9).at(-1);
    assert.ok(Math.abs(gpe.t - empezo - 24 / 30) <= DT + 1e-6, `${(gpe.t - empezo).toFixed(3)} s`);
  });

  test("APARTARSE DURANTE EL AMAGO ESQUIVA: fuera de la esfera al llegar el fotograma, el guion no pega", () => {
    const r = montar("monsters/giantrat", { evento: "bite1" });
    // Se espera al primer ataque y, en ese mismo instante, el jugador se va a
    // 300 unidades: el `dodamage ent_lastseen 48 …` mira desde el ojo con
    // 48 + 16 de radio (npcscript.cpp:1146-1157).
    for (let k = 0; k < 600 && r.ataques.length === 0; k++) r.paso();
    assert.equal(r.ataques.length, 1, "control: la rata ha empezado a atacar");
    r.lejos.aU = 300;
    for (let k = 0; k < 40; k++) r.paso();
    const c = r.manada.golpesDelGuion;
    assert.equal(c.eventos, 1, "el evento del modelo ha llegado");
    assert.equal(c.alAire, 1, `y el \`dodamage\` ha ido al aire: ${JSON.stringify(c)}`);
    assert.equal(r.golpes.length, 0, "nadie ha recibido nada");
    assert.equal(r.recibidos().game_dodamage ?? 0, 0, "y sin `DoDamage` sobre nadie no hay `game_dodamage` (giattack.cpp:1615-1630, al mundo: sin portar)");
  });

  test("CONTROL: sin el evento en el modelo, la rata pega como desde el 17 — por la IA, con tres parámetros", () => {
    const r = montar("monsters/giantrat", { evento: null });
    r.correr(12);
    assert.equal(r.manada.golpesDelGuion.atacaPorGuion, 0);
    assert.equal(r.manada.golpesDelGuion.eventos, 0);
    assert.ok(r.golpes.length >= 2, `la IA muerde: ${r.golpes.length}`);
    assert.ok(r.golpes.every((x) => x.nArgs === 3), "el golpe de la IA no pasa tipo");
    assert.equal(r.recibidos().bite1 ?? 0, 0);
  });

  test("CONTROL: un evento que el guion NO maneja deja el daño a la IA (en el motor sería un bicho que no pega)", () => {
    const r = montar("monsters/giantrat", { evento: "warcry_done" });
    r.correr(12);
    assert.equal(r.manada.golpesDelGuion.atacaPorGuion, 0);
    assert.ok(r.golpes.length >= 2 && r.golpes.every((x) => x.nArgs === 3));
  });

  test("CONTROL DE LA COSTURA: sin enchufar no hay guion que lo reciba, y pega la IA", () => {
    const r = montar("monsters/giantrat", { evento: "bite1", enchufar: false });
    r.correr(12);
    assert.equal(r.manada.golpesDelGuion.eventos, 0);
    assert.ok(r.golpes.length >= 2 && r.golpes.every((x) => x.nArgs === 3));
  });

  test("el `dmgmulti` del mapa multiplica el daño del guion (npcscript.cpp:1160-1162)", () => {
    const uno = montar("monsters/giantrat", { evento: "bite1" });
    const dos = montar("monsters/giantrat", { evento: "bite1", postspawn: { titulo: "default", dmgmulti: "2.00", hpmulti: "1.00", params: "none" } });
    uno.correr(12); dos.correr(12);
    assert.ok(uno.golpes.length >= 1 && dos.golpes.length >= 1);
    assert.ok(uno.golpes.every((x) => Math.abs(x.dano - 0.4) < 1e-6), JSON.stringify(uno.golpes.map((x) => x.dano)));
    assert.ok(dos.golpes.every((x) => Math.abs(x.dano - 0.8) < 1e-6), JSON.stringify(dos.golpes.map((x) => x.dano)));
  });

  test("un PARRY del jugador vuelve el mordisco del guion un «0» en `game_dodamage`", () => {
    const r = montar("monsters/giantrat", { evento: "bite1", defensa: () => ({ parado: true, dano: 0 }) });
    r.correr(12);
    const dd = r.g().guion.rastro.filter((x) => x.evento === "game_dodamage");
    assert.ok(r.golpes.length >= 1, "control: algún mordisco llegó a la defensa");
    assert.ok(dd.length >= 1 && dd.every((x) => x.params[0] === "0"), JSON.stringify(dd.map((x) => x.params[0])));
  });

  test("lo que el guion apunta para la IA: las tres variables que escribiría su caza, también en la familia vieja", () => {
    // La vieja escribe `NPCATK_TARGET` «forward compat» (base_npc_attack.script:526, :595).
    // Lejos primero: el guion nace y nadie ataca, así que no puede estar.
    const r = montar("monsters/giantrat", { evento: "bite1", aU: 3000 });
    r.correr(1);
    assert.ok(r.g(), "control: el guion ha nacido");
    assert.notEqual(r.g().guion.vars.get("NPCATK_TARGET"), "P1", "control: sin atacar no está");
    r.lejos.aU = 30;
    r.correr(3);
    assert.ok(r.manada.golpesDelGuion.atacaPorGuion >= 1, "control: ha atacado");
    const g = r.g();
    for (const v of ["NPCATK_TARGET", "HUNT_LASTTARGET", "ENTITY_ENEMY"]) assert.equal(g.guion.vars.get(v), "P1", v);
  });

});

// ── EL VENENO: `bite_dodamage` ─────────────────────────────────────────────

describe("la araña venenosa envenena desde `bite_dodamage`, y las otras no", { skip: !HAY_MOD }, () => {
  test("Poisonous Spider: `bite1` -> `frame_bite1` -> `xdodamage … dmgevent:bite` -> `bite_dodamage` -> `effects/dot_poison`", () => {
    // A 10 unidades: la araña mide 20 de alto y su `ATTACK_RANGE 38`; a 30 el
    // `range` 3D desde sus pies al centro del jugador ya no le llega (el 82).
    const r = montar("monsters/spider_mini_poison", { evento: "bite1", aU: 10 });
    r.correr(15);
    const rec = r.recibidos();
    assert.ok((rec.game_damaged_other ?? 0) >= 1, `control: algún mordisco ha entrado: ${JSON.stringify(rec)}`);
    assert.equal(rec.bite_dodamage, rec.game_dodamage, "`<dmgevent>_dodamage` va con cada `game_dodamage` (giattack.cpp:2046-2058)");
    const venenos = r.efectos.filter((e) => e.ruta === "effects/dot_poison");
    assert.ok(venenos.length >= 1, "y el veneno llega al anfitrión");
    assert.equal(venenos[0].aplicador?.nombre, "Poisonous Spider", "con el nombre de quien lo puso: es el «X hits you» del veneno");
    assert.ok(r.golpes.every((x) => x.tipo === "pierce"), "el mordisco es `pierce` (spider_base.script:34)");
  });

  test("LA RAREZA DEL MOD: antes del primer acierto no envenena, y desde él envenena con cada mordisco, también los fallados", () => {
    // `bite_dodamage` no mira PARAM1 y apunta a `ent_laststruckbyme`, que sólo
    // se escribe al acertar (giattack.cpp:1754-1756). O sea: sin acierto
    // previo no hay a quién, y después siempre hay alguien.
    const r = montar("monsters/spider_mini_poison", { evento: "bite1", aU: 10, azar: dado(3) });
    r.correr(20);
    const dd = r.g().guion.rastro.filter((x) => x.evento === "bite_dodamage").map((x) => x.params[0]);
    const primero = dd.indexOf("1");
    assert.ok(primero >= 0, `control: algún mordisco entra: ${dd.join("")}`);
    assert.ok(dd.slice(primero).includes("0"), `control: después del primero alguno falla: ${dd.join("")}`);
    const venenos = r.efectos.filter((e) => e.ruta === "effects/dot_poison").length;
    assert.equal(venenos, dd.length - primero, `${dd.join("")}: un veneno por mordisco desde el primer acierto`);
  });

  test("CONTROL NEGATIVO: la rata muerde por el guion y no envenena", () => {
    const r = montar("monsters/giantrat", { evento: "bite1" });
    r.correr(15);
    assert.ok(r.golpes.length >= 1);
    assert.equal(r.efectos.length, 0);
  });

  test("CONTROL NEGATIVO: la araña de Gate City muerde por su guion (`frame_bite1`, pierce) y NO envenena al morder", () => {
    // Lo que el encargo daba por hecho y el mod no dice: `monsters/spider`
    // pega con `dmgevent:bite` y no maneja `bite_dodamage`. Su veneno es el
    // SALTO (`spider_latch_hit` -> `effect_spiderlatch`, spider.script), que
    // cuelga de un `repeatdelay` que este puerto no arma para un NPC.
    //
    // EL 93: el salto ya existe (`test/salto93a.test.mjs`), así que aquí la
    // araña lleva su MODELO de verdad —si no, se queda a medio salto— y lo que
    // se mira es que ningún veneno sale del MORDISCO: los efectos que llegan,
    // si llegan, son `effect_spiderlatch`, el del salto, nunca `dot_poison`
    // directo. Antes decía `efectos.length === 0`, que con el salto portado
    // es falso en una de cada dos pasadas sin que el mordisco envenene.
    //
    // Y el jugador llega DESPUÉS del primer segundo: la araña de Gate City
    // hace `setanim.framerate BASE_FRAMERATE` en cada mordisco
    // (spider.script:207-209), y `BASE_FRAMERATE` no existe hasta su
    // `npc_post_spawn` (base_self_adjust.script:141, un segundo tras nacer):
    // un mordisco antes la deja a ritmo 0, congelada. Es del mod, y lo mide
    // `test/salto93a.test.mjs`; aquí no es lo que se viene a medir.
    const r = montar("monsters/spider", { evento: "frame_bite1", aU: 3000, reales: secuenciasDelModelo("monsters/spider.mdl") });
    r.correr(1.5);
    r.lejos.aU = 30;
    r.correr(15);
    const rec = r.recibidos();
    assert.ok(r.golpes.length >= 1 && r.golpes.every((x) => x.tipo === "pierce"), JSON.stringify(r.golpes));
    assert.ok((rec.bite_dodamage ?? 0) >= 1, "el motor le manda `bite_dodamage` igual…");
    assert.equal(r.g().maneja("bite_dodamage"), false, "…y su guion no lo tiene");
    assert.ok(r.efectos.every((e) => e.ruta === "effects/effect_spiderlatch"), JSON.stringify(r.efectos.map((e) => e.ruta)));
  });
});

// ── LOS OTROS DE GATE CITY ─────────────────────────────────────────────────

describe("Gate City: el goblin y el zombi pegan con lo que dice SU guion", { skip: !HAY_MOD }, () => {
  test("el goblin: `swing_axe` -> `npcatk_dodamage NPCATK_TARGET direct …`, con el tipo «PARAM6» del mod", () => {
    // `npcatk_dodamage` reenvía PARAM5..7 (base_monster_shared.script:1163-1171)
    // y el goblin le da cuatro: PARAM6 no es una variable y se resuelve a su
    // nombre (script.cpp:5709 sólo pone los que llegan). El tipo del golpe es
    // la cadena «PARAM6», en el juego también.
    const r = montar("monsters/goblin", { evento: "swing_axe", aU: 40 });
    r.correr(12);
    assert.ok(r.golpes.length >= 1, JSON.stringify(r.manada.golpesDelGuion));
    assert.ok(r.golpes.every((x) => x.tipo === "PARAM6"), JSON.stringify(r.golpes.map((x) => x.tipo)));
    assert.equal(r.g().guion.vars.get("NPCATK_TARGET"), "P1", "familia nueva: `NPCATK_TARGET` (base_npc_attack_new.script:445)");
  });

  test("el zombi pega con el daño del ARMA que sorteó al nacer, no con el 20 del horneado", () => {
    // `dwarf_zombie_random` sortea `WEAPON_TYPE` y con él `ATTACK_DAMAGE`
    // 20/30/40/55/50 (dwarf_zombie_random.script:165-252); el horneado lee el
    // primero. Con el daño en el guion, pega el de verdad.
    const vistos = new Set();
    for (let semilla = 1; semilla <= 6; semilla++) {
      const r = montar("monsters/dwarf_zombie_random", { evento: "attack_1", aU: 40, azar: dado(semilla) });
      r.correr(10);
      const suyo = Number(r.g().guion.vars.get("ATTACK_DAMAGE"));
      assert.ok(r.golpes.length >= 1, `semilla ${semilla}`);
      assert.ok(r.golpes.every((x) => Math.abs(x.dano - suyo) < 1e-6), `semilla ${semilla}: ${suyo} y ${JSON.stringify(r.golpes.map((x) => x.dano))}`);
      vistos.add(suyo);
    }
    // El segundo caso (el 50): si todas las semillas sacaran el arma de 20,
    // esta prueba no distinguiría el daño del guion del horneado.
    assert.ok([...vistos].some((v) => v !== 20), `armas vistas: ${[...vistos].join(", ")}`);
  });
});

// ── EL RELOJ DE LOS EVENTOS ────────────────────────────────────────────────

describe("el reloj de los eventos de animación", { skip: !HAY_MOD }, () => {
  test("uno de bucle salta una vez por vuelta (animation.cpp:323-324)", () => {
    // La rata quieta y lejos: 2 s de `idle1` (30 fotogramas a 15 = 2 s) con un
    // evento en el fotograma 5 dan una llamada por vuelta.
    // Sin pasear: el paseo le pondría la de andar y el reposo no daría vueltas.
    const r = montar("monsters/giantrat", { enReposo: "frame_reposo92", aU: 3000, relacion: RELACION.ALIADO, pasea: false });
    r.correr(9);
    const n = r.manada.golpesDelGuion.eventos;
    assert.ok(n >= 4 && n <= 5, `${n} en 9 s`);
  });

  test("un `dodamage` fuera de un evento de animación no pega y se apunta", () => {
    const r = montar("monsters/giantrat", { evento: "bite1" });
    r.correr(0.2);
    const g = r.g();
    g.guion.llamar("bite1", []);
    assert.equal(g.danoCuenta.sinGancho, 1);
    assert.ok(g.guion.noSoportados.some((x) => /fuera de un evento de animación/.test(x.nombre)));
    assert.equal(r.golpes.length, 0);
  });
});
