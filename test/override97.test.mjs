// EL 97: `[override]` REHORNEADO, Y LO QUE CAMBIA EN EL JUEGO.
//
// El 96 arregló el analizador (`partirGuion`, src/play/guion.js) y el cargador
// (`resolverGuion`, src/play/cargador.js) para que un `[override]` borre los
// eventos anteriores con su nombre, como el motor:
//
//     if (Name.len() && Override)
//       for (int i = 0; i < m.Events.size(); i++)
//         if (Name == m.Events[i].Name) { m.Events.erase(i); i--; }
//                                            script.cpp:5206-5211
//
// pero no rehorneó. Esto mide lo que cambia al rehornear, en los bichos y el
// vendedor de Gate City que lo sufrían, y la otra cosa que salió por el camino:
// el `//` pegado a una palabra, que el motor corta ANTES de analizar
// (script.cpp:5118-5121) y aquí no se cortaba.
//
// TODO ENTRA POR DONDE ENTRA EL JUEGO (CLAUDE.md §4, el 59 y el 67): el texto
// del guion sale del MOD y lo parte el analizador; nadie escribe `anula: true`
// a mano. Lo «de antes» se reproduce quitando la marca DESPUÉS de analizar,
// que es exactamente el fallo del 96 (`[override]` leído y no aplicado), y
// sirve de control positivo: si el instrumento no viera las copias de antes,
// no podría decir que ahora hay una.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones, RELACION } from "../src/bsp/script.js";
import { Manada } from "../src/play/manada.js";
import { InteraccionesNpc } from "../src/juego/interacciones.js";
import { partirGuion } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";
import { cargarGuion, leerScript } from "../tools/scriptsmsr.mjs";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const HAY_MOD = existsSync(SCRIPTS);
const U = 39.37;
const DT = 1 / 60;

/** El cargador de ANTES del 96: el `[override]` se lee y no se aplica. */
function cargarSinAnular(ruta) {
  return resolverGuion(ruta, (r) => {
    const t = leerScript(r, SCRIPTS);
    if (t === null) return null;
    const p = partirGuion(t);
    for (const pz of p.piezas) if (pz.evento) delete pz.evento.anula;
    return p;
  }, new Set());
}

const copias = (g, nombre) => g.eventos.filter((e) => e.nombre === nombre).length;

function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ── 1. EL CENSO, con el texto del mod ──────────────────────────────────────

describe("1. cada `[override]` de Gate City deja UNA copia, la suya", { skip: !HAY_MOD }, () => {
  // Las diez parejas que cambian al rehornear Gate City (doc/OVERRIDE_97.md),
  // con las copias de antes contadas por el mismo cargador sin anular.
  const CASOS = [
    ["monsters/spider", "game_parry", 3],
    ["monsters/spider_spitting", "bite1", 2],
    ["monsters/dwarf_zombie_random", "npcatk_flee", 2],
    ["monsters/dwarf_zombie_sword", "npcatk_flee", 2],
    ["monsters/dwarf_zombie_sword", "pick_weapon_type", 2],
    ["monsters/dwarf_zombie_bigaxe", "npcatk_flee", 2],
    ["monsters/dwarf_zombie_bigaxe", "pick_weapon_type", 2],
    ["monsters/dwarf_zombie_hbow", "darcher_spawn", 2],
    ["monsters/dwarf_zombie_hbow", "select_ammo", 2],
    ["gatecity/generalstore", "say_containers", 2],
  ];
  for (const [ruta, ev, antes] of CASOS) {
    test(`${ruta} · ${ev}: ${antes} -> 1`, () => {
      assert.equal(copias(cargarSinAnular(ruta), ev), antes, "control: antes había esas copias");
      const g = cargarGuion(ruta);
      assert.equal(copias(g, ev), 1);
      assert.equal(g.eventos.find((e) => e.nombre === ev).anula, true, "y la que queda es la del `[override]`");
    });
  }

  test("la que queda de la araña es la SUYA: la que mira si está agarrada (spider.script:63-67)", () => {
    const e = cargarGuion("monsters/spider").eventos.find((x) => x.nombre === "game_parry");
    assert.deepEqual(e.cmds.map((c) => `${c.nombre} ${c.params.join(" ")}`),
      ["if !SPIDER_LATCHING", "playanim critical ANIM_DODGE"]);
  });

  test("lo que va DESPUÉS del `[override]` con el mismo nombre se queda: el motor sólo mira atrás", () => {
    const g = resolverGuion("x", (r) => (r === "x" ? partirGuion("{ [override] ev\n saytext a\n}\n{ ev\n saytext b\n}\n") : null));
    assert.deepEqual(g.eventos.map((e) => e.cmds[0].params[0]), ["a", "b"]);
  });

  test("y borra también lo que trajo un `#include` anterior, que va a la misma `m.Events`", () => {
    const tabla = {
      hijo: partirGuion("#include padre\n{ [override] ev\n saytext hijo\n}\n"),
      padre: partirGuion("{ ev\n saytext padre\n}\n{ otro\n saytext x\n}\n"),
    };
    const g = resolverGuion("hijo", (r) => tabla[r] ?? null);
    assert.deepEqual(g.eventos.map((e) => `${e.nombre}:${e.cmds[0].params[0]}`), ["otro:x", "ev:hijo"]);
  });
});

describe("1b. el horneado está al día con el cargador (si está horneado)", () => {
  for (const mapa of ["gatecity", "edana", "edanasewers", "gertenheld_forest2", "sala88"]) {
    const f = `build/${mapa}/guiones.json`;
    test(`${mapa}: ningún evento convive con un \`[override]\` posterior de su nombre`, { skip: !existsSync(f) }, () => {
      const j = JSON.parse(readFileSync(f, "utf8"));
      const malos = [];
      for (const [ruta, g] of Object.entries(j.guiones)) {
        g.eventos.forEach((e, k) => {
          if (e.nombre && g.eventos.slice(k + 1).some((o) => o.anula && o.nombre === e.nombre)) malos.push(`${ruta}:${e.nombre}`);
        });
      }
      assert.deepEqual(malos, [], "horneado de antes del 97: `npm run guiones -- --mapa " + mapa + "`");
      // Y la marca VIAJA: sin ella el navegador no distinguiría nada.
      assert.ok(Object.values(j.guiones).some((g) => g.eventos.some((e) => e.anula)),
        "ningún evento con `anula`: el horneado no la lleva");
    });
  }
});

// ── 2. EL `//` PEGADO, que el motor corta antes de analizar ────────────────

describe("2. `//` pegado a una palabra corta la línea (script.cpp:5118-5121)", () => {
  test("la cabecera de `wearing_armor` del guion del jugador (player/externals.script:304)", () => {
    const { eventos } = partirGuion("{ [shared] wearing_armor//PARAM1=0|1 PARAM2=Type(platemail/leather/etc) PARAM3=offset\n setvard A 1\n}\n");
    assert.equal(eventos[0].nombre, "wearing_armor");
  });
  test("el empujón del jabalí (boar_base.script:93): la constante, sin el comentario", () => {
    const { eventos } = partirGuion("{ x\n   addvelocity ent_laststruckbyme PUSH_VEL//Push the player a bit\n}\n");
    assert.deepEqual(eventos[0].cmds[0].params, ["ent_laststruckbyme", "PUSH_VEL"]);
  });
  test("`else//if(...)` es un `else`: el correr del jugador (player_animation.script:95)", () => {
    const { eventos } = partirGuion("{ x\n if( A )\n {\n  setvard T a\n }\n else//if( B )\n {\n  setvard T b\n }\n setvard Z 1\n}\n");
    assert.equal(eventos.length, 1, "un solo evento: el `{` de detrás no abre otro");
    assert.equal(eventos[0].cmds.at(-1).nombre, "setvard");
    assert.equal(eventos[0].cmds.at(-1).params[0], "Z");
  });
  test("el guion de verdad: `wearing_armor` existe con su nombre, que es el que llama la armadura híbrida", { skip: !HAY_MOD }, () => {
    // items/armor_base_hybrid.script:111: `callexternal $get(ent_owner,id) wearing_armor 0`.
    const g = cargarGuion("player/player");
    assert.equal(copias(g, "wearing_armor"), 1);
    assert.ok(!g.eventos.some((e) => /\/\//.test(e.nombre ?? "")), "ningún nombre con `//` dentro");
  });
});

// ── 3. EL PARRY DE LA ARAÑA, por la costura ────────────────────────────────

/** El arnés de test/costura91.test.mjs, con el guion que se le pase. */
function montarBicho(script, guion, { aU = 32, azar = dado(5), hp = null, evento = "bite1", extra = [] } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, script));
  // EL 98: el ataque se llama como su `ANIM_ATTACK` (el esqueleto, `attack1`):
  // la IA pone ahora el que pide el guion (`Manada._animDeAtaque`), y con el
  // nombre reescrito a `attack` el esqueleto caía en la secuencia 0 y no
  // llegaba ni un `attack_1` («han llegado 0»). Ver test/mordisco92a.
  const golpe = ficha.ia?.golpe ?? "attack";
  const manada = new Manada({
    mapa: "liso", unidadesPorMetro: U,
    razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_x", script, clave: "b",
      nombre: ficha.nombre ?? script, hp: hp ?? ficha.hp ?? 10, ancho: ficha.ancho, alto: ficha.alto,
      parado: "idle1", andando: "walk", piel: 0,
      escena: [0, 0, 0], yaw: 0, luz: [0, 0, 0],
      hostil: true, relacion: RELACION.ODIO,
      ia: { ...ficha.ia, golpe, ...(hp ? { vida: hp } : {}) },
    }],
  }, {
    secuenciasPorClave: new Map([["b", [
      { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 15, avance: [0, 0, 0], eventos: [] },
      { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0], eventos: [] },
      { indice: 2, nombre: "run", fps: 30, fotogramas: 25, bucle: true, actividad: 4, pesoActividad: 1, avance: [76, 0, 0], eventos: [] },
      // El mordisco en el fotograma 14 con el código 600, como el de la rata
      // (test/mordisco92a.test.mjs): `gspider.mdl` llama a `bite1`
      // (build/msr/bichosguion.json, `anim.llaman`).
      { indice: 3, nombre: golpe, fps: 30, fotogramas: 30, bucle: false, actividad: 28, pesoActividad: 1, avance: [0, 0, 0],
        eventos: [{ frame: 14, evento: 600, opciones: evento }] },
      { indice: 4, nombre: "die", fps: 30, fotogramas: 40, bucle: false, actividad: 36, pesoActividad: 1, avance: [0, 0, 0], eventos: [] },
      ...extra.map((x, k) => ({ indice: 5 + k, fps: 30, fotogramas: 30, bucle: false, actividad: 28, pesoActividad: 1, avance: [0, 0, 0], ...x })),
    ]]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 32] }]]),
    azar,
  });
  const i = manada.instancias[0];
  const sucesos = [];
  const inter = new InteraccionesNpc({
    sesion: { personaje: { id: "P1", nombre: "Ana", vida: 1000 } },
    guiones: { guiones: { [script]: guion } },
    npcPorId: (id) => manada.de(id),
    suceso: (t, x) => sucesos.push(`${t}: ${x}`),
    losNpc: () => manada.instancias,
    dondeEstaElJugador: () => [i.donde[0] + aU / U, i.donde[1], i.donde[2]],
    unidadesPorMetro: U,
    animar: (inst, nombre, modo) => manada.playanim(inst, nombre, modo),
    aplicarEfecto: () => ({}),
  });
  inter.enchufarA(manada);
  const golpes = [];
  const arnes = {
    libre: () => true, suelo: () => 0, veA: () => true,
    objetivos: (b) => [{ id: "jugador", donde: [b.donde[0] * U + aU, b.donde[1] * U + 36, b.donde[2] * U], esJugador: true, relacion: RELACION.ODIO, ancho: 0 }],
    golpear: (_b, id, dano, tipo) => { golpes.push({ id, dano, tipo, t: manada.t }); return { parado: false, dano }; },
  };
  const correr = (s) => { for (let t = 0; t < s; t += DT) { manada.relojes(DT); manada.cazar(DT, arnes); inter.paso(DT); } };
  const g = () => inter.guionesVivos.get(i.id) ?? null;
  return { manada, inter, i, g, sucesos, golpes, correr };
}

const PARRY = /Your attack was/;

describe("3. la araña gigante esquiva y NO te lo dice: su `game_parry` es otro", { skip: !HAY_MOD }, () => {
  const parar = (guion) => {
    const r = montarBicho("monsters/spider", guion);
    r.inter.paso(0);
    const h = r.manada.herir(r.i, 2, { tipo: "slash", dados: { quien: "jugador", parry: 90, acc: 1 } });
    return { ...r, h, corridos: r.g().guion.rastro.filter((x) => x.evento === "game_parry").length };
  };

  test("CONTROL, el guion de antes: tres `game_parry` y «Your attack was dodged!» del de la base", () => {
    const r = parar(cargarSinAnular("monsters/spider"));
    assert.equal(r.h.parado, true, "la IA ha parado");
    assert.equal(r.corridos, 3);
    assert.deepEqual(r.sucesos.filter((s) => PARRY.test(s)), ["normal: Your attack was dodged!"],
      "el instrumento ve el mensaje del guion cuando lo hay");
  });

  test("el de ahora: UN `game_parry`, el suyo, y el guion no dice nada", () => {
    const r = parar(cargarGuion("monsters/spider"));
    assert.equal(r.h.parado, true);
    assert.equal(r.corridos, 1);
    assert.deepEqual(r.sucesos.filter((s) => PARRY.test(s)), []);
  });

  // EL RELEVO DE `main.js`. «Your attack was …» lo escribía también
  // `golpearA` (y `arco.js`) con `ia.mensajeDeParry`, desde el 86, cuando el
  // bicho no tenía guion. Desde el 91 el guion corre y lo dice él: salían DOS
  // líneas por parada (medido en el navegador: 2,00 con el esqueleto de
  // gertenheld_forest2). `herir` dice ahora si habló un guion, y el relevo
  // sólo escribe si no.
  test("`herir` dice que habló el guion cuando la costura le llevó el `game_parry`", () => {
    const r = parar(cargarGuion("monsters/spider"));
    assert.equal(r.h.hablaElGuion, true);
  });
  test("CONTROL: sin costura enchufada (sin guion) no habló nadie, y el relevo tiene que escribir", () => {
    const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, "monsters/spider"));
    const manada = new Manada({
      mapa: "liso", unidadesPorMetro: U, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
      colocados: [{ clase: "msmonster_x", script: "monsters/spider", clave: "b", nombre: ficha.nombre, hp: 100, ancho: ficha.ancho, alto: ficha.alto,
        parado: "idle1", andando: "walk", piel: 0, escena: [0, 0, 0], yaw: 0, luz: [0, 0, 0], hostil: true, relacion: RELACION.ODIO, ia: { ...ficha.ia } }],
    }, { secuenciasPorClave: new Map([["b", []]]), cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 32] }]]), azar: dado(5) });
    const h = manada.herir(manada.instancias[0], 2, { tipo: "slash", dados: { quien: "jugador", parry: 90, acc: 1 } });
    assert.equal(h.parado, true);
    assert.equal(h.hablaElGuion, false);
    assert.equal(h.mensaje, "dodged!", "y el relevo tiene su texto (spider_base.script:4)");
  });
});

// ── 4. EL MORDISCO DE LA ESCUPIDORA ─────────────────────────────────────────

describe("4. la araña escupidora muerde UNA vez por `bite1`, no dos", { skip: !HAY_MOD }, () => {
  // Antes corrían las dos `bite1`: la de `spider_base` (:36-38), que llama a
  // `frame_bite1` y hace su `xdodamage` (:31-34), y la suya
  // (spider_spitting.script:87-100), que hace otro `xdodamage` y escupe.
  const morder = (guion) => {
    const r = montarBicho("monsters/spider_spitting", guion, { aU: 30, azar: dado(9) });
    r.correr(12);
    const recibidos = r.g()?.costuraCuenta?.recibidos ?? {};
    return { ...r, eventos: recibidos.bite1 ?? 0, pedidos: r.g()?.danoCuenta?.pedidos ?? 0 };
  };

  test("CONTROL, el guion de antes: dos `xdodamage` por cada `bite1` que llega", () => {
    const r = morder(cargarSinAnular("monsters/spider_spitting"));
    assert.ok(r.eventos >= 2, `han llegado ${r.eventos} \`bite1\``);
    assert.equal(r.pedidos, 2 * r.eventos, JSON.stringify(r.g().danoCuenta));
  });

  test("el de ahora: uno por `bite1`", () => {
    const r = morder(cargarGuion("monsters/spider_spitting"));
    assert.ok(r.eventos >= 2, `han llegado ${r.eventos} \`bite1\``);
    assert.equal(r.pedidos, r.eventos, JSON.stringify(r.g().danoCuenta));
  });
});

describe("4b. EL SEGUNDO CASO: el esqueleto venenoso de gertenheld_forest2 y su `attack_1`", { skip: !HAY_MOD }, () => {
  // El mismo patrón en otro bicho y otro mapa (el 50): `skeleton_base` hace su
  // `xdodamage` en `attack_1` (:477-482) y `skeleton_poison_random` lo anula
  // con el suyo (:317), que pone el veneno y pega. Antes, dos espadazos por
  // evento del modelo.
  //
  // EL 98: la IA pone ahora el `ANIM_ATTACK` del guion, y este esqueleto
  // sortea `attack2` en uno de cada tres `attack_1` (:327) y vuelve a
  // `attack1` en su `attack_2` (:345). El modelo de prueba no traía `attack2`:
  // caía en la secuencia 0, sin evento, `attack_2` no llegaba nunca y el
  // esqueleto se quedaba en `attack2` para siempre — rojo «han llegado 1» una
  // pasada de cada pocas (el sorteo es del guion, no del dado del arnés). Así
  // que el modelo lleva su `attack2` con el `attack_2` del fotograma 6
  // (skeleton.mdl), y los `dodamage` de `attack_2` —uno, :344; el otro
  // `attack_2` (:220-226) tira un proyectil— se descuentan.
  const pegar = (guion) => {
    const r = montarBicho("monsters/skeleton_poison_random", guion, {
      aU: 30, azar: dado(9), evento: "attack_1",
      extra: [{ nombre: "attack2", eventos: [{ frame: 6, evento: 600, opciones: "attack_2" }] }],
    });
    r.correr(12);
    const rec = r.g()?.costuraCuenta?.recibidos ?? {};
    return { eventos: rec.attack_1 ?? 0, saltos: rec.attack_2 ?? 0, pedidos: r.g()?.danoCuenta?.pedidos ?? 0 };
  };
  test("CONTROL, el guion de antes: dos por `attack_1`", () => {
    const { eventos, saltos, pedidos } = pegar(cargarSinAnular("monsters/skeleton_poison_random"));
    assert.ok(eventos >= 2, `han llegado ${eventos}`);
    assert.equal(pedidos - saltos, 2 * eventos);
  });
  test("el de ahora: uno", () => {
    const { eventos, saltos, pedidos } = pegar(cargarGuion("monsters/skeleton_poison_random"));
    assert.ok(eventos >= 2, `han llegado ${eventos}`);
    assert.equal(pedidos - saltos, eventos);
  });
});

// ── 5. EL TENDERO DE GATE CITY ──────────────────────────────────────────────

describe("5. «container» al tendero: sus cuatro frases, y no las tres de la plantilla detrás", { skip: !HAY_MOD }, () => {
  // `catchspeech say_containers sheath pack container`
  // (base_npc_vendor_confirm.script:42) lo registra `vend_post_spawn`; el
  // tendero declara `[override] say_containers` (gatecity/generalstore.script:150-156)
  // con cuatro `saytext` seguidos. Antes corría también el de la plantilla
  // (:270-279), que encadena las suyas con `chat_loop` y retardo.
  const preguntar = (guion) => {
    const npc = { id: 7, ficha: { script: "gatecity/generalstore", nombre: "Shopkeeper" }, donde: [0, 0, 0] };
    const dicho = [];
    const inter = new InteraccionesNpc({
      sesion: { personaje: { id: "P1", nombre: "Ana", misiones: [] } },
      guiones: { guiones: { "gatecity/generalstore": guion } },
      npcPorId: (id) => (id === 7 ? npc : null), losNpc: () => [npc],
      dondeEstaElJugador: () => [0.5, 0, 0], unidadesPorMetro: U,
      suceso: (t, x) => dicho.push(String(x)),
    });
    inter.guionDe(npc);
    for (let k = 0; k < 300; k++) inter.paso(DT);
    dicho.length = 0;
    const r = inter.hablaElJugador("container");
    for (let k = 0; k < 60 * 40; k++) inter.paso(DT);
    return { r, suyas: dicho.filter((d) => d.startsWith("Shopkeeper says")) };
  };

  test("CONTROL, el guion de antes: siete frases, con la primera repetida", () => {
    const { r, suyas } = preguntar(cargarSinAnular("gatecity/generalstore"));
    assert.deepEqual(r.contestaron.map((c) => c.evento), ["say_containers"]);
    assert.equal(suyas.length, 7, suyas.join("\n"));
    assert.equal(suyas.filter((s) => /Weapon straps/.test(s)).length, 2);
  });

  test("el de ahora: las cuatro suyas, una vez, en su orden", () => {
    const { suyas } = preguntar(cargarGuion("gatecity/generalstore"));
    assert.equal(suyas.length, 4, suyas.join("\n"));
    assert.match(suyas[0], /Weapon straps/);
    assert.match(suyas[2], /can't hold much\./, "la frase del tendero, no la de la plantilla («very many»)");
    assert.match(suyas[3], /specialized sheaths/);
  });
});
