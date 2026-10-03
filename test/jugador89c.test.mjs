// EL 89c: LOS COMANDOS QUE CAMBIAN EL ESTADO DEL JUGADOR DESDE SU GUION.
//
// `drainstamina`, `gold`/`addgold`, `removeitem`, `setvelocity`/`addvelocity`,
// `setorigin`, `setstat` y `noxploss`.
//
// Todo entra por `new GuionDelJugador` con TEXTO de guion, partido por el
// analizador de verdad —el 67: si hay analizador, la prueba le da texto— y con
// el estado inyectado por la misma puerta que usa `src/main.js`. Ninguna prueba
// llama al entorno a mano: eso es el 59 y el 63.
//
// Y una sección con el guion DE VERDAD (`build/msr/jugador.json`), que es la
// que dice qué corre jugando y qué no.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { GuionDelJugador, SIN_QUIEN_LOS_LLAME, EVENTOS_DEL_JUGADOR, indiceDeSubestadistica } from "../src/play/guionjugador.js";
import { Guion, partirGuion, entornoVacio, COMANDOS } from "../src/play/guion.js";
import { habilidadesDePartida } from "../src/juego/stats.js";

/**
 * Un jugador cuyo guion es `texto`, con el estado al lado para leerlo.
 * `vida` > 0 salvo que se diga: `addvelocity` mira `IsAlive`.
 */
function montar(texto, { aguante = 5, maximo = 8, oro = 10, vida = 50, sinAguante = false, sinFisica = false } = {}) {
  const estado = { aguante, empujes: [], origenes: [], cambios: [], sucesos: [] };
  const personaje = {
    nombre: "Ana", vida, mana: 5, oro,
    habilidades: habilidadesDePartida(),
    objetos: [{ id: "swords_rsword", n: 1 }, { id: "health_apple", n: 1 }, { id: "health_mpotion", n: 1 }],
    manos: { derecha: "swords_rsword", izquierda: null },
  };
  const j = new GuionDelJugador({
    ficha: partirGuion(texto),
    personaje,
    suceso: (tipo, t) => estado.sucesos.push({ tipo, t }),
    consejo: () => {},
    ahora: () => 10,
    aguante: sinAguante ? null : {
      leer: () => estado.aguante,
      poner: (v) => { estado.aguante = v; },
      maximo: () => maximo,
    },
    fisica: sinFisica ? null : {
      empujar: (v, sumar) => estado.empujes.push({ v: [...v], sumar }),
      colocar: (v) => estado.origenes.push([...v]),
    },
    cambio: (que) => estado.cambios.push(que),
  });
  const huecos = () => [...j.guion.noSoportados, ...j.noSoportados];
  return { j, personaje, estado, huecos };
}

const evento = (cuerpo) => `{ prueba\n${cuerpo}\n}`;

// ── 1. `drainstamina` ──────────────────────────────────────────────────────

describe("`drainstamina` (89c)", () => {
  test("resta, y la cantidad va TRUNCADA: `WRITE_LONG` de un float", () => {
    // 5 - 2,9 serían 2,1; con el truncado del mensaje (scriptcmds.cpp:2996-2998)
    // son 3. Los dos números están lejos a propósito: el 71.
    const m = montar(evento(" drainstamina ent_me 2.9"));
    m.j.llamar("prueba");
    assert.equal(m.estado.aguante, 3);
  });

  test("no baja de cero ni sube del máximo, y negativo SUMA (`-1000` es «llénalo»)", () => {
    const a = montar(evento(" drainstamina ent_me 100"));
    a.j.llamar("prueba");
    assert.equal(a.estado.aguante, 0);
    const b = montar(evento(" drainstamina ent_me -1000"), { aguante: 1, maximo: 8 });
    b.j.llamar("prueba");
    assert.equal(b.estado.aguante, 8);
  });

  test("a otro que no es él NO se lo resta a él, y lo apunta", () => {
    const m = montar(evento(" drainstamina PARAM1 3"));
    m.j.llamar("prueba", ["PentP(3,9)"]);
    assert.equal(m.estado.aguante, 5);
    assert.ok(m.huecos().some((h) => h.tipo === "drainstamina a otro"), JSON.stringify(m.huecos()));
  });

  test("con un parámetro solo es `ERROR_MISSING_PARMS`: no hace nada", () => {
    const m = montar(evento(" drainstamina 3"));
    m.j.llamar("prueba");
    assert.equal(m.estado.aguante, 5);
  });

  test("sin aguante inyectado SE APUNTA: no hay `=> {}` donde vivir callado", () => {
    const m = montar(evento(" drainstamina ent_me 1"), { sinAguante: true });
    m.j.llamar("prueba");
    assert.ok(m.huecos().some((h) => h.tipo === "drainstamina sin aguante"));
  });
});

// ── 2. `gold` y `addgold` ──────────────────────────────────────────────────

describe("`gold` / `addgold` (89c)", () => {
  test("`addgold` suma y NO deja bajar de cero (`CMSMonster::GiveGold`)", () => {
    const m = montar(evento(" addgold 25\n addgold -100"));
    m.j.llamar("prueba");
    assert.equal(m.personaje.oro, 0);
    assert.ok(m.estado.cambios.includes("oro"), "el cambio no se avisó: no se guardaría");
  });

  test("`addgold` sin pasarse: 10 + 25 = 35", () => {
    const m = montar(evento(" addgold 25"));
    m.j.llamar("prueba");
    assert.equal(m.personaje.oro, 35);
  });

  test("`gold` PONE a pelo, y un negativo se queda negativo (`m_Gold = atoi`)", () => {
    const m = montar(evento(" gold -3"));
    m.j.llamar("prueba");
    assert.equal(m.personaje.oro, -3);
  });

  test("`atoi`: «12.9» son 12 y «abc» es 0", () => {
    const m = montar(evento(" gold 12.9"));
    m.j.llamar("prueba");
    assert.equal(m.personaje.oro, 12);
    const n = montar(evento(" addgold abc"));
    n.j.llamar("prueba");
    assert.equal(n.personaje.oro, 10);
  });

  test("y SIN MENSAJE: `GiveGold` no es virtual y se llama desde `CMSMonster`", () => {
    // «You recieve %i gold coins» es de `CBasePlayer::GiveGold` (player.cpp:5697)
    // y esta llamada no llega ahí. Un mensaje plausible inventado es el 65.
    const m = montar(evento(" addgold 25"));
    m.j.llamar("prueba");
    assert.deepEqual(m.estado.sucesos, []);
  });
});

// ── 3. `removeitem` ────────────────────────────────────────────────────────

describe("`removeitem` (89c)", () => {
  test("busca por SUBCADENA del nombre (`strstr`) y quita UNO", () => {
    const m = montar(evento(" removeitem potion"));
    m.j.llamar("prueba");
    assert.deepEqual(m.personaje.objetos.map((o) => o.id), ["swords_rsword", "health_apple"]);
    assert.ok(m.estado.cambios.includes("objetos"));
  });

  test("las MANOS primero, aunque en la lista vaya la última", () => {
    // `GetItem` mira `Hand(i)` antes que las mochilas (msmonstershared.cpp:196-200).
    // «h» casa con la manzana y con la poción; la manzana va antes en la
    // lista y la poción está en la mano. Gana la mano.
    const m = montar(evento(" removeitem h"));
    m.personaje.manos.derecha = "health_mpotion";
    m.j.llamar("prueba");
    assert.deepEqual(m.personaje.objetos.map((o) => o.id), ["swords_rsword", "health_apple"]);
    assert.equal(m.personaje.manos.derecha, null);
  });

  test("con una ENTIDAD, como lo llama el guion del jugador, no quita nada: «this doesn't work»", () => {
    const m = montar(evento(" removeitem PARAM1"));
    m.j.llamar("prueba", ["PentP(12,34)"]);
    assert.equal(m.personaje.objetos.length, 3);
    assert.deepEqual(m.estado.cambios, []);
  });
});

// ── 4. `setvelocity` / `addvelocity` / `setorigin` ─────────────────────────

describe("velocidad y posición (89c)", () => {
  test("`addvelocity` suma y `setvelocity` pone, en UNIDADES y ejes del motor", () => {
    const m = montar(evento(" addvelocity ent_me (1,2,3) override\n setvelocity ent_me (-600,0,180)"));
    m.j.llamar("prueba");
    assert.deepEqual(m.estado.empujes, [
      { v: [1, 2, 3], sumar: true },
      { v: [-600, 0, 180], sumar: false },
    ]);
  });

  test("un muerto no se empuja (`!IsAlive` → `abort_push`), pero SÍ se coloca", () => {
    const m = montar(evento(" addvelocity ent_me (1,2,3)\n setorigin ent_me (20000,20000,-20000)"), { vida: 0 });
    m.j.llamar("prueba");
    assert.deepEqual(m.estado.empujes, []);
    assert.deepEqual(m.estado.origenes, [[20000, 20000, -20000]]);
  });

  test("a OTRO —un monstruo de un hechizo— no se le empuja al jugador: se apunta", () => {
    const m = montar(evento(" setvelocity CUR_TARG (0,1000,0)"));
    m.j.llamar("prueba");
    assert.deepEqual(m.estado.empujes, []);
    assert.ok(m.huecos().some((h) => h.tipo === "setvelocity a otro"));
  });

  test("un getter que no tenemos NO manda al jugador al origen del mapa", () => {
    // `$vec` sin portar vuelve como su texto, y `StringToVec` de eso es
    // (0,0,0). Es `warp_out`, en `game_death`: sin esta guarda el muerto
    // aparecería en el centro del mapa.
    const m = montar(evento(" setorigin ent_me $nogetter(20000,20000,-20000)"));
    m.j.llamar("prueba");
    assert.deepEqual(m.estado.origenes, []);
    assert.ok(m.huecos().some((h) => h.tipo === "vector sin getter"), JSON.stringify(m.huecos()));
  });

  test("pero una VARIABLE sin poner da (0,0,0) y se aplica, como en el motor", () => {
    // `GetVar` devuelve el nombre, y `StringToVec("NEW_SPAWN_POS")` es cero.
    // Por eso `tele_spawn` lleva su guarda `isnot 'NEW_SPAWN_POS'`.
    const m = montar(evento(" setorigin ent_me NEW_SPAWN_POS"));
    m.j.llamar("prueba");
    assert.deepEqual(m.estado.origenes, [[0, 0, 0]]);
  });

  test("sin física inyectada se apunta", () => {
    const m = montar(evento(" setorigin ent_me (1,2,3)"), { sinFisica: true });
    m.j.llamar("prueba");
    assert.ok(m.huecos().some((h) => h.tipo === "setorigin sin física"));
  });
});

// ── 5. `setstat` ───────────────────────────────────────────────────────────

describe("`setstat` en el jugador (89c)", () => {
  test("`setstat parry 7` escribe LA subestadística del parry", () => {
    const m = montar(evento(" setstat parry 7"));
    m.j.llamar("prueba");
    assert.equal(m.personaje.habilidades.parry.proficiency.valor, 7);
    assert.ok(m.estado.cambios.includes("habilidades"));
  });

  test("sin punto: en ORDEN y SIN tope; con punto: una y CON tope de 100", () => {
    const m = montar(evento(" setstat Swordsmanship 4 5 500\n setstat axehandling.power 500"));
    m.j.llamar("prueba");
    const s = m.personaje.habilidades.swordsmanship;
    assert.deepEqual([s.proficiency.valor, s.balance.valor, s.power.valor], [4, 5, 500]);
    assert.equal(m.personaje.habilidades.axehandling.power.valor, 100);
  });

  test("las escuelas por su nombre, y «prof» es alias", () => {
    assert.equal(indiceDeSubestadistica("prof"), 0);
    assert.equal(indiceDeSubestadistica("Lightning"), 2);
    const m = montar(evento(" setstat spellcasting.divination 9"));
    m.j.llamar("prueba");
    assert.equal(m.personaje.habilidades.spellcasting.divination.valor, 9);
  });

  test("lo que no existe se apunta, y `parry.power` NO escribe fuera", () => {
    const m = montar(evento(" setstat strength 5\n setstat parry.power 5"));
    m.j.llamar("prueba");
    assert.equal(m.personaje.habilidades.parry.proficiency.valor, 1);
    const h = m.huecos().filter((x) => x.tipo === "setstat").map((x) => x.nombre);
    assert.deepEqual(h, ["strength", "parry.power"]);
  });
});

// ── 6. `noxploss` ──────────────────────────────────────────────────────────

describe("`noxploss` (89c)", () => {
  test("no existe en el motor: no hace nada Y no se apunta como hueco", () => {
    const m = montar(evento(" noxploss ent_me 0\n gold 4"));
    m.j.llamar("prueba");
    assert.equal(m.personaje.oro, 4, "la línea de después no corrió");
    assert.ok(!m.huecos().some((h) => h.nombre === "noxploss"), JSON.stringify(m.huecos()));
  });
});

// ── 7. LOS HERMANOS: un entorno sin el gancho APUNTA ───────────────────────

describe("en un entorno sin el gancho, se apunta (89c, el 66 y el 81)", () => {
  test("los nueve, con `entornoVacio`, que es la base del de un NPC y un objeto", () => {
    const nombres = ["drainstamina", "gold", "addgold", "removeitem", "setvelocity", "addvelocity", "setorigin", "setstat"];
    for (const n of nombres) assert.ok(COMANDOS.has(n), `${n} no está en COMANDOS`);
    assert.ok(COMANDOS.has("noxploss"));
    const g = new Guion({
      ...partirGuion(evento(nombres.map((n) => ` ${n} ent_me (1,2,3) 4`).join("\n"))),
      entorno: entornoVacio(),
    });
    g.llamar("prueba", []);
    const apuntados = g.noSoportados.filter((x) => x.tipo === "comando").map((x) => x.nombre).sort();
    assert.deepEqual(apuntados, [...nombres].sort());
  });
});

// ── 8. EL GUION DE VERDAD ──────────────────────────────────────────────────

const ficha = (() => {
  try { return JSON.parse(readFileSync("build/msr/jugador.json", "utf8")); }
  catch { return null; }
})();
const hay = Boolean(ficha);

function jugadorDeVerdad({ aguante = 0.5, maximo = 8 } = {}) {
  const estado = { aguante };
  const personaje = { nombre: "Ana", vida: 50, mana: 5, oro: 10, habilidades: habilidadesDePartida() };
  let t = 10;
  const j = new GuionDelJugador({
    ficha, personaje, suceso: () => {}, consejo: () => {}, ahora: () => t,
    aguante: { leer: () => estado.aguante, poner: (v) => { estado.aguante = v; }, maximo: () => maximo },
  });
  const avanzar = (s) => { for (let k = 0; k < Math.round(s / 0.1); k++) { t += 0.1; j.paso(0.1); } };
  return { j, personaje, estado, avanzar };
}

describe("`player/player` de verdad (89c)", () => {
  test("al ENTRAR, un segundo después, el aguante se llena (`activate_stuff`)", { skip: !hay }, () => {
    // `game_player_putinworld` → `callevent 1.0 activate_stuff` →
    // `drainstamina ent_me -1000` (player_main.script:1043 y :147). Es el
    // ÚNICO `drainstamina` del guion del jugador que corre jugando.
    const m = jugadorDeVerdad();
    m.j.llamar(EVENTOS_DEL_JUGADOR.ENTRA, []);
    // Control del retraso: antes del segundo NO se ha llenado. Sin esto, el
    // verde de abajo no distinguiría «lo llenó el evento» de «lo llenó algo al
    // entrar».
    m.avanzar(0.5);
    assert.equal(m.estado.aguante, 0.5, "se llenó antes del `callevent 1.0`");
    m.avanzar(0.7);
    assert.equal(m.estado.aguante, 8);
    assert.ok(m.j.disparados.includes("player_joined"), "activate_stuff no corrió");
  });

  test("`noxploss` está en `game_player_putinworld` y no deja hueco", { skip: !hay }, () => {
    const m = jugadorDeVerdad();
    m.j.llamar(EVENTOS_DEL_JUGADOR.ENTRA, []);
    assert.ok(!m.j.guion.noSoportados.some((h) => h.nombre === "noxploss"));
  });

  test("`ext_addgold` / `ext_setgold` del guion del jugador llegan al oro", { skip: !hay }, () => {
    // Los llaman una bolsa de oro (`chests/bag_o_gold_base.script:37`) y la
    // compra de una bolsa (`game_player_got_from_store`). NINGUNO corre hoy
    // jugando —ver SIN_QUIEN_LOS_LLAME—; esto mide que el día que corran, el
    // guion llega al oro.
    const m = jugadorDeVerdad();
    m.j.llamar("ext_addgold", ["25"]);
    assert.equal(m.personaje.oro, 35);
    m.j.llamar("ext_setgold", ["3"]);
    assert.equal(m.personaje.oro, 3);
  });

  test("lo que NO corre jugando está declarado, y `main.js` de verdad no lo llama", { skip: !hay }, () => {
    // Si alguien conecta uno de éstos, esta prueba se pone roja y le dice que lo
    // quite de la lista: una lista de «esto no corre» envejece (el 68, el 79).
    const main = readFileSync("src/main.js", "utf8");
    for (const ev of ["game_equipped", "game_leapback", "game_leapleft", "game_leapright", "game_player_got_from_store"]) {
      assert.ok(SIN_QUIEN_LOS_LLAME[ev], `${ev} no está declarado`);
      assert.ok(!main.includes(`"${ev}"`), `main.js llama a ${ev}: quítalo de SIN_QUIEN_LOS_LLAME`);
    }
    assert.ok(!/EVENTOS_DEL_JUGADOR\.EMPUNA/.test(main), "main.js llama a EMPUNA: quita game_equipped de SIN_QUIEN_LOS_LLAME");
  });
});
