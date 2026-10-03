// LOS EFECTOS: `applyeffect`, `removeeffect` y `removescript`.
//
// Un efecto de Master Sword es OTRO GUION que se pega a la entidad objetivo
// (`CGlobalScriptedEffects::ApplyEffect`, scriptedeffects.cpp:25-58). Estas
// pruebas entran por TEXTO —los `.script` de verdad de `../MSC/`, o un guion
// escrito aquí y pasado por `partirGuion`— y por los constructores por los que
// entra el juego (`new GuionDelJugador`, `new GuionDeNpc`), no por objetos
// construidos a mano: CLAUDE.md §4, las variantes del 59, el 63 y el 67.
//
// Si no está `../MSC/` (un clon sin el juego al lado), lo que lo necesita se
// salta y lo dice.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { partirGuion } from "../src/play/guion.js";
import { TablaDeEfectos, EfectosDeEntidad, cargarCabecera, GuionDeEfecto, aplicadorDeBicho } from "../src/play/efectos.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";
import { GuionDeNpc, RelojDeGuiones } from "../src/play/npcguion.js";
import { leerScript, cargarGuion, RAIZ_POR_OMISION } from "../tools/scriptsmsr.mjs";

const HAY = existsSync(`${RAIZ_POR_OMISION}/effects/base_effect.script`);
const sinJuego = !HAY && "sin ../MSC/MSCScripts al lado";

/** La tabla, como la hornea `tools/efectosguion.mjs`: los archivos una vez, sin resolver. */
function tablaDe(rutas) {
  const archivos = {};
  const meter = (r) => {
    if (archivos[r] !== undefined) return;
    const t = leerScript(r);
    archivos[r] = t === null ? null : { piezas: partirGuion(t).piezas };
    for (const p of archivos[r]?.piezas ?? []) if (p.include) meter(p.include);
  };
  rutas.forEach(meter);
  return new TablaDeEfectos({ archivos });
}

/** Un jugador de verdad —`new GuionDelJugador`— con su guion escrito en texto. */
function jugadorCon(texto, { vida = 10, max = 50, tabla = null } = {}) {
  const p = partirGuion(texto);
  const sucesos = [];
  const personaje = { id: "jugador1", nombre: "Sonda", vida, mana: 5, oro: 0, objetos: [], manos: {} };
  let t = 0;
  const j = new GuionDelJugador({
    ficha: { eventos: p.eventos, preload: p.preload },
    personaje,
    ahora: () => t,
    maximos: () => ({ vida: max, mana: 20 }),
    suceso: (tipo, x) => sucesos.push(`${tipo}: ${x}`),
    // El mismo tope que `src/main.js`: `V_min(Max - Current, Amt)`.
    dar: (que, n) => { if (que === "vida" && n > 0) personaje.vida = Math.min(max, personaje.vida + n); },
    efectos: tabla,
  });
  const avanzar = (s, paso = 0.1) => { for (let k = 0; k < Math.round(s / paso); k++) { t += paso; j.paso(paso); } };
  return { j, personaje, sucesos, avanzar, get t() { return t; } };
}

// ── 1. LO QUE HACE EL MOTOR, PASO A PASO ────────────────────────────────────

describe("applyeffect: el efecto se pega al objetivo y corre su game_activate", { skip: sinJuego }, () => {
  test("la cura de effect_rejuv2 cura AL ANFITRIÓN, y con PARAM2 —el TERCER parámetro de la línea—", () => {
    // `Parameters.add( Params[i+2] )` (scriptcmds.cpp:1920-1922): el objetivo y
    // el guion se comen. `local HEAL_AMT PARAM2` (effects/effect_rejuv2.script:22).
    const tabla = tablaDe(["effects/effect_rejuv2"]);
    const { j, personaje } = jugadorCon(`{ curame\n applyeffect ent_me effects/effect_rejuv2 0 7 $get(ent_me,id)\n}`, { tabla });
    j.llamar("curame");
    assert.equal(personaje.vida, 17, "10 + 7: la cura llega por el `givehp` del efecto");
    assert.equal(j.efectos.historial.at(-1).id, "effect_rejuvenate");
  });

  test("se cura uno a sí mismo y el efecto lo SABE: «You heal yourself»", () => {
    // `if ( MY_ID isnot CASTER_ID ) local HEALING_OTHER 1` (:30). Con el asa
    // bien puesta, aplicárselo uno mismo NO es curar a otro.
    const tabla = tablaDe(["effects/effect_rejuv2"]);
    const { j, sucesos } = jugadorCon(`{ curame\n applyeffect ent_me effects/effect_rejuv2 0 7 $get(ent_me,id)\n}`, { tabla });
    j.llamar("curame");
    assert.deepEqual(sucesos, ["bueno: You heal yourself for 7 hp"]);
  });

  test("y `removescript` lo quita al siguiente fotograma, no en el acto", () => {
    // `m.RemoveNextFrame = true` (scriptcmds.cpp:5117); lo barre el siguiente
    // `IScripted::RunScriptEvents` (script.cpp:5906-5922).
    const tabla = tablaDe(["effects/effect_rejuv2"]);
    const { j, avanzar } = jugadorCon(`{ curame\n applyeffect ent_me effects/effect_rejuv2 0 7 $get(ent_me,id)\n}`, { tabla });
    j.llamar("curame");
    assert.equal(j.efectos.lista.length, 1, "sigue en la lista hasta el barrido");
    assert.equal(j.efectos.activos.length, 0, "pero marcado");
    avanzar(0.1);
    assert.equal(j.efectos.lista.length, 0);
  });

  test("a un objetivo MUERTO no se le pega nada (scriptcmds.cpp:1873)", () => {
    const tabla = tablaDe(["effects/effect_rejuv2"]);
    const { j, personaje } = jugadorCon(`{ curame\n applyeffect ent_me effects/effect_rejuv2 0 7 $get(ent_me,id)\n}`, { tabla, vida: 0 });
    j.llamar("curame");
    assert.equal(personaje.vida, 0);
    assert.equal(j.efectos.historial.at(-1).resultado, "muerto");
  });

  test("al objetivo se le avisa ANTES con game_applyeffect y sus parámetros", () => {
    // Cmd.Name(), EntToString(quien), y del guion en adelante (:1890-1898).
    const tabla = tablaDe(["effects/effect_rejuv2"]);
    const { j } = jugadorCon(`{ curame
 applyeffect ent_me effects/effect_rejuv2 0 7 $get(ent_me,id)
}
{ game_applyeffect
 setvard VISTO PARAM1 PARAM3 PARAM5
}`, { tabla });
    j.llamar("curame");
    assert.equal(j.guion.vars.get("VISTO"), "applyeffecteffects/effect_rejuv27");
  });

  test("un guion que no existe: el motor avisa y no hace nada (scriptedeffects.cpp:28-32)", () => {
    const tabla = tablaDe(["effects/effect_rejuv2"]);
    const { j } = jugadorCon(`{ e\n applyeffect ent_me effects/effect_stun 5\n}`, { tabla });
    j.llamar("e");
    // `effects/effect_stun` lo nombra un guion del juego y NO EXISTE en los 2 884.
    assert.equal(j.efectos.historial.at(-1).resultado, "no existe");
    assert.ok(j.efectos.noSoportados.some((x) => x.nombre === "effects/effect_stun"));
  });

  test("sin tabla de efectos, applyeffect se APUNTA: no hay `=> {}` callado", () => {
    const { j, personaje } = jugadorCon(`{ curame\n applyeffect ent_me effects/effect_rejuv2 0 7 0\n}`, { tabla: null });
    j.llamar("curame");
    assert.equal(personaje.vida, 10);
    assert.ok(j.efectos.noSoportados.length > 0);
  });

  test("y a una entidad sin guion (un bicho de este puerto) se apunta y no se finge", () => {
    const tabla = tablaDe(["effects/dot_fire"]);
    const { j } = jugadorCon(`{ e\n applyeffect CUR_TARG effects/dot_fire 5.0 $get(ent_me,id) 3\n}`, { tabla });
    j.llamar("e");
    assert.equal(j.efectos.lista.length, 0);
    assert.ok(j.noSoportados.some((x) => x.tipo === "applyeffect"));
  });
});

// ── 2. LA PILA Y LA CARGA ───────────────────────────────────────────────────

describe("la pila: nostack, y el `const` que se resuelve AL CARGAR", { skip: sinJuego }, () => {
  test("effect_templock lleva `nostack` porque el `const` se resuelve al cargar", () => {
    // `const EFFECT_FLAGS nostack` (effect_templock.script:7) y luego, en la
    // plantilla, `const game.effect.flags EFFECT_FLAGS` (base_effect.script:44).
    // SCRIPTCONST al cargar (script.cpp:40-41, :5409): vale «nostack».
    const tabla = tablaDe(["effects/effect_templock"]);
    const ef = new EfectosDeEntidad({ tabla, anfitrion: { id: () => "x", vivo: () => true, entorno: () => ({}), llamar: () => false } });
    const uno = ef.aplicar("effects/effect_templock", []);
    assert.equal(uno.id, "effect_lock");
    assert.equal(uno.banderas, "nostack");
  });

  test("un segundo templock NO se pone: nostack (scriptedeffects.cpp:45-49)", () => {
    const tabla = tablaDe(["effects/effect_templock"]);
    const { j } = jugadorCon(`{ e\n applyeffect ent_me effects/effect_templock\n}`, { tabla });
    j.llamar("e");
    j.llamar("e");
    assert.deepEqual(j.efectos.historial.map((h) => h.resultado), ["activo", "nostack"]);
    assert.equal(j.efectos.activos.length, 1);
  });

  test("y uno SIN nostack se apila y oye game_duplicated", () => {
    const tabla = tablaDe(["effects/effect_rejuv2"]);
    const ef = new EfectosDeEntidad({ tabla, anfitrion: { id: () => "x", vivo: () => true, entorno: () => ({}), llamar: () => false } });
    // Dos curas en el mismo fotograma: el primero sigue en la lista (marcado,
    // sin barrer) y el bucle del motor NO mira `RemoveNextFrame`.
    ef.aplicar("effects/effect_rejuv2", ["0", "1", "x"]);
    const dos = ef.aplicar("effects/effect_rejuv2", ["0", "1", "x"]);
    assert.ok(dos.guion.rastro.some((r) => r.evento === "game_duplicated"));
  });

  test("cargarCabecera: el primero gana, y el valor se resuelve contra lo ya cargado", () => {
    const p = partirGuion(`{
 const A nostack
 const B A
 const A otra
 const C 'A'
}`);
    const g = new GuionDeEfecto({ ruta: "x", resuelto: { eventos: p.eventos, preload: [] }, lista: new EfectosDeEntidad() });
    cargarCabecera(g.guion, p.preload);
    assert.equal(g.guion.resolver("A"), "nostack");
    assert.equal(g.guion.resolver("B"), "nostack");
    assert.equal(g.guion.resolver("C"), "A", "entre comillas simples no se resuelve");
  });
});

// ── 3. EL EFECTO ES UN GUION DE LA ENTIDAD: OYE LO QUE ELLA OYE ─────────────

describe("removeeffect, y los eventos del anfitrión llegan a sus efectos", { skip: sinJuego }, () => {
  test("`callexternal ent_me ext_end_templock` llega al EFECTO y lo quita", () => {
    // Es como lo quita el banco: player/externals.script:2313. El evento no es
    // del jugador, es del efecto (effect_templock.script:19).
    const tabla = tablaDe(["effects/effect_templock"]);
    const { j, avanzar } = jugadorCon(`{ pon\n applyeffect ent_me effects/effect_templock\n}
{ quita\n callexternal ent_me ext_end_templock\n}`, { tabla });
    j.llamar("pon");
    assert.equal(j.efectos.activos.length, 1);
    j.llamar("quita");
    assert.equal(j.efectos.activos.length, 0);
    avanzar(0.1);
    assert.equal(j.efectos.lista.length, 0);
  });

  test("`removeeffect ent_me <id>` llama effect_die y lo marca (scriptcmds.cpp:5096-5102)", () => {
    const tabla = tablaDe(["effects/effect_templock"]);
    const { j } = jugadorCon(`{ pon\n applyeffect ent_me effects/effect_templock\n}
{ quita\n removeeffect ent_me effect_lock\n}`, { tabla });
    j.llamar("pon");
    const ef = j.efectos.lista[0];
    j.llamar("quita");
    assert.equal(ef.quitar, true);
    assert.ok(ef.guion.rastro.some((r) => r.evento === "effect_die"));
  });

  test("la duración de base_effect: a los 4,9 s se quita solo", () => {
    // `callevent EFFECT_DURATION effect_duration_ended` (base_effect.script:62).
    //
    // OJO, Y NO SE CUENTA ENTRE LOS VERDES DEL ALARGAR: la comprobación de
    // :67-71 usa `$math`, que este puerto no tiene, y su texto crudo se lee
    // como 0 — así que «se acaba al vencer» sale bien POR CASUALIDAD y
    // «alargar la duración» (`effect_increase_duration`) no funciona.
    const tabla = tablaDe(["effects/gauntlet_invalid"]);
    const { j, avanzar } = jugadorCon(`{ e\n applyeffect ent_me effects/gauntlet_invalid 4.9\n}`, { tabla });
    j.llamar("e");
    avanzar(4.8);
    assert.equal(j.efectos.activos.length, 1);
    avanzar(0.3);
    assert.equal(j.efectos.activos.length, 0);
  });
});

// ── 4. EL CASO DE PUNTA A PUNTA: EL SUMO SACERDOTE DE EDANA ─────────────────

describe("el sumo sacerdote de Edana te cura, entrando por su menú", { skip: sinJuego }, () => {
  /**
   * `edana/highpriest.script`: «Ask to be Healed» -> `say_heal` ->
   * `calleventtimed 1 attack_1` -> `applyeffect ent_lastspoke
   * effects/effect_rejuv2 0 1000 $get(ent_me,id)` (:94). Se monta con
   * `new GuionDeNpc` y con el gancho que pone `src/juego/interacciones.js`.
   */
  function montar({ vida = 10 } = {}) {
    const tabla = tablaDe(["effects/effect_rejuv2"]);
    const jug = jugadorCon("{ nada\n}", { tabla, vida });
    const reloj = new RelojDeGuiones();
    const ficha = cargarGuion("edana/highpriest");
    const npc = new GuionDeNpc({
      ficha, npc: { nombre: "High Priest", script: "edana/highpriest" },
      programar: (s, que) => reloj.programar(s, que),
      suceso: (tipo, x) => jug.sucesos.push(`${tipo}: ${x}`),
      aplicarEfecto: (ruta, params, o) => jug.j.efectos.aplicar(ruta, params, o),
    });
    const ctx = { personaje: jug.personaje, ref: "jugador1" };
    const ops = npc.pedirOpciones(ctx);
    const i = ops.findIndex((o) => o.titulo === "Ask to be Healed");
    return { ...jug, npc, reloj, ctx, i };
  }

  test("al segundo de pedirlo, la vida sube al MÁXIMO y lo dice con el nombre del sacerdote", () => {
    const m = montar({ vida: 10 });
    assert.ok(m.i >= 0, "el menú trae «Ask to be Healed»");
    m.npc.elegir(m.i, m.ctx);
    assert.equal(m.personaje.vida, 10, "todavía no: es un `calleventtimed 1`");
    m.reloj.paso(1.0);
    assert.equal(m.personaje.vida, 50, "10 + 1000, con el tope del máximo");
    // `gplayermessage MY_ID $get(CASTER_ID,name) heals you for HEAL_AMT hp` (:40).
    assert.ok(m.sucesos.includes("bueno: High Priest heals you for 1000 hp"), m.sucesos.join(" | "));
    // Y la otra línea (:39) va AL SACERDOTE, que no es un jugador: no sale.
    assert.ok(!m.sucesos.some((s) => s.includes("You heal")), m.sucesos.join(" | "));
  });

  test("con la vida llena no cura NI DICE NADA: el aviso va al sacerdote", () => {
    // `gplayermessage CASTER_ID $get(MY_ID,name) is at maximum health` (:50):
    // con HEALING_OTHER, el único mensaje del caso es para quien cura.
    const m = montar({ vida: 50 });
    m.npc.elegir(m.i, m.ctx);
    m.reloj.paso(1.0);
    assert.equal(m.personaje.vida, 50);
    assert.ok(!m.sucesos.some((s) => s.includes("health") || s.includes("heals")), m.sucesos.join(" | "));
    assert.equal(m.j.efectos.historial.at(-1)?.id, "effect_rejuvenate", "el efecto SÍ se puso");
  });

  test("sin el gancho del juego, el sacerdote lo apunta en vez de curar en silencio", () => {
    const ficha = cargarGuion("edana/highpriest");
    const reloj = new RelojDeGuiones();
    const npc = new GuionDeNpc({ ficha, npc: { nombre: "High Priest" }, programar: (s, q) => reloj.programar(s, q) });
    const ctx = { personaje: { id: "jugador1", vida: 10, objetos: [], manos: {} }, ref: "jugador1" };
    const ops = npc.pedirOpciones(ctx);
    npc.elegir(ops.findIndex((o) => o.titulo === "Ask to be Healed"), ctx);
    reloj.paso(1.0);
    assert.equal(ctx.personaje.vida, 10);
    assert.ok(npc.noSoportados.some((x) => x.tipo === "applyeffect"), JSON.stringify(npc.noSoportados));
  });
});

// ── 5. EL SENTARSE DEL JUGADOR ES UN EFECTO, Y SE PONE AL ENTRAR ────────────

const fichaJugador = () => {
  try { return JSON.parse(readFileSync("build/msr/jugador.json", "utf8")); } catch { return null; }
};

describe("game_player_putinworld pone `player/emote_sit&stand`", { skip: sinJuego }, () => {
  test("el guion de verdad del jugador se lo aplica al entrar, y su velocidad vive AHÍ", async () => {
    const ficha = fichaJugador();
    if (!ficha) return;   // sin `npm run jugador` no hay guion del jugador que montar
    const tabla = tablaDe(["player/emote_sit&stand"]);
    const personaje = { id: "jugador1", nombre: "Sonda", vida: 10, mana: 5, oro: 0, objetos: [], manos: {}, habilidades: {} };
    const j = new GuionDelJugador({ ficha, personaje, efectos: tabla, maximos: () => ({ vida: 50, mana: 20 }) });
    j.llamar("game_player_putinworld", []);
    assert.deepEqual(j.efectos.activos.map((e) => e.id), ["player_sitstand"]);
    // `callexternal ent_me plr_change_speed normal //... player/emote_sitstand`
    // (player/player_main.script:308): el evento es DEL EFECTO.
    const ef = j.efectos.lista[0];
    j.llamar("plr_change_speed", ["normal"]);
    assert.ok(ef.guion.rastro.some((r) => r.evento === "plr_change_speed"));
  });
});

// ── 6. EL VENENO: era la prueba PENDIENTE del 90, y el 91 la cierra ─────────
//
// En el 90 esto decía «dot_poison sobre el jugador se para en los getters que
// faltan, y lo dice»: `$get_takedmg` sin soporte devolvía su propio texto, que
// `==` lee como 0, y el efecto se quitaba diciendo «You resist the poison.».
// El 91 portó lo que faltaba (`test/veneno91.test.mjs`, con todas las piezas).
// Aquí queda el caso de punta a punta por la MISMA puerta que el resto de este
// archivo: `new GuionDelJugador` con la tabla de efectos y la puerta del daño
// que inyecta `src/main.js`.

describe("el veneno sobre el jugador (el 91)", { skip: sinJuego }, () => {
  test("dot_poison de un bicho: «You have been poisoned!», cinco golpes de 3 y se va", () => {
    const tabla = tablaDe(["effects/dot_poison"]);
    const heridas = [];
    const sucesos = [];
    const personaje = { id: "jugador1", nombre: "Sonda", vida: 40, mana: 5, oro: 0, objetos: [], manos: {} };
    let t = 0;
    const j = new GuionDelJugador({
      ficha: partirGuion("{ nada\n}"), personaje, efectos: tabla, ahora: () => t,
      maximos: () => ({ vida: 50, mana: 20 }),
      suceso: (tipo, x) => sucesos.push(`${tipo}: ${x}`),
      herir: (g) => { heridas.push(g); personaje.vida -= g.dano; },
    });
    // El bicho, por `aplicadorDeBicho` —la pieza que lo construye para el
    // juego y la sonda— y no un objeto escrito aquí (el 59): una araña que te
    // odia (`relacion` −4, como la hornea `tools/bichos.mjs`) y sigue viva.
    const bicho = aplicadorDeBicho({ ficha: { nombre: "Leaping Cave Spider", relacion: -4, ia: { raza: "spider" } }, vida: 10 }, { indice: 3 });
    j.efectos.aplicar("effects/dot_poison", ["5", bicho.id, "3", "none"], { aplicador: bicho });
    for (let k = 0; k < 60; k++) { t += 0.1; j.paso(0.1); }
    assert.ok(sucesos.includes("normal: You have been poisoned!"), sucesos.join(" | "));
    assert.ok(!sucesos.some((s) => s.includes("resist")), sucesos.join(" | "));
    assert.equal(heridas.length, 5);
    assert.equal(personaje.vida, 25);
    assert.ok(sucesos.includes("normal: The poison subsides."), sucesos.join(" | "));
    assert.equal(j.efectos.activos.length, 0);
  });

  // PENDIENTE, y no se cuenta entre los verdes: que un BICHO se lo ponga al
  // jugador al morderle (`bite_dodamage`, `pbolt_cloud_dodamage`…). Pide que
  // los bichos corran guion, que es el trabajo de otra sesión. Hasta entonces
  // el veneno sólo lo aplica la sonda (`sondas/veneno91.mjs`) por la misma
  // puerta que usa el juego.
  test.todo("PENDIENTE: un bicho le pone el veneno al jugador desde su guion (los bichos no corren guion todavía)");
});
