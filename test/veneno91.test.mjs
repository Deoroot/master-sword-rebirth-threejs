// EL 91: EL VENENO. Lo que los `effects/dot_*` necesitaban para hacer daño al
// jugador: `xdodamage`/`dodamage`, `scriptflags`, `takedmg`, `$get_takedmg`,
// `$math`, `$string_upto`/`$string_from`, `$get_scriptflag` y `$pass`.
//
// Las piezas entran por TEXTO —`partirGuion`, el analizador de verdad, el 67— y
// por `new GuionDelJugador`, que es por donde entra el juego (el 59, el 63).
// El veneno de punta a punta usa el `.script` de verdad de `../MSC/` y la ficha
// horneada de una araña de Gate City (`build/gatecity/bichos.json`); sin ellos
// se salta y lo dice.
//
// LO QUE ESTO NO PRUEBA, dicho al principio: que un bicho le PONGA el veneno
// al jugador. Los bichos de este puerto no corren guion —es el trabajo de otra
// sesión—, así que aquí el veneno lo aplica la prueba por el mismo
// `efectos.aplicar` que usa el juego, con el bicho como aplicador.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { partirGuion, leerDano, mathDelMotor, cadenaHasta, flotanteDelMotor, COMANDOS, GETTERS } from "../src/play/guion.js";
import { TablaDeEfectos, BanderasDeEntidad, ResistenciasDeEntidad, golpeDirecto, aplicadorDeBicho, relacionEnTexto } from "../src/play/efectos.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";
import { RELACION } from "../src/bsp/razas.js";
import { leerScript, RAIZ_POR_OMISION } from "../tools/scriptsmsr.mjs";

const HAY_JUEGO = existsSync(`${RAIZ_POR_OMISION}/effects/dot_poison.script`);
const HAY_BICHOS = existsSync("build/gatecity/bichos.json");
const sinVeneno = (!HAY_JUEGO && "sin ../MSC/MSCScripts al lado") || (!HAY_BICHOS && "sin build/gatecity/bichos.json (npm run mapa:bichos)");

/** La tabla de efectos como la hornea `tools/efectosguion.mjs`. */
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

/** Una araña de Gate City TAL COMO LA HORNEA `tools/bichos.mjs`, como instancia viva. */
function arana() {
  const b = JSON.parse(readFileSync("build/gatecity/bichos.json", "utf8"));
  const ficha = b.colocados.find((c) => c.script === "monsters/spider");
  const i = { ficha, vida: ficha.hp ?? 10, muerto: false, dormido: false, opacidad: 1 };
  return { i, razas: new Map(b.razas) };
}

/**
 * Un jugador de verdad —`new GuionDelJugador`— con su guion escrito en texto y
 * la puerta del daño inyectada como la inyecta `src/main.js`: aquí apunta y
 * resta, allí va al `golpear` de los bichos.
 */
function jugadorCon(texto, { vida = 40, tabla = null } = {}) {
  const p = partirGuion(texto);
  const sucesos = [];
  const heridas = [];
  const personaje = { id: "jugador1", nombre: "Sonda", vida, mana: 5, oro: 0, objetos: [], manos: {} };
  let t = 0;
  const j = new GuionDelJugador({
    ficha: { eventos: p.eventos, preload: p.preload },
    personaje,
    ahora: () => t,
    maximos: () => ({ vida: 50, mana: 20 }),
    suceso: (tipo, x) => sucesos.push({ t, texto: `${tipo}: ${x}` }),
    efectos: tabla,
    herir: (g) => { heridas.push({ t, ...g }); personaje.vida -= g.dano; },
  });
  const avanzar = (s, paso = 0.1) => { for (let k = 0; k < Math.round(s / paso); k++) { t += paso; j.paso(paso); } };
  return { j, personaje, sucesos, heridas, avanzar, get t() { return t; } };
}

// ── 1. LAS PIEZAS DEL INTÉRPRETE, CON SUS RAREZAS ──────────────────────────

describe("$math (script.cpp:3271-3401)", () => {
  test("«%.2f», como todo RETURN_FLOAT", () => {
    assert.equal(mathDelMotor(["add", "1", "2"]), "3.00");
    assert.equal(mathDelMotor(["multiply", "1.0", "100"]), "100.00");
    assert.equal(mathDelMotor(["subtract", "5", "7.5"]), "-2.50");
  });
  test("divide por cero —O DE cero— da 0", () => {
    assert.equal(mathDelMotor(["divide", "0", "5"]), "0.00");
    assert.equal(mathDelMotor(["divide", "5", "0"]), "0.00");
  });
  test("las operaciones van por `starts_with`, y una que no existe da «0»", () => {
    assert.equal(mathDelMotor(["addition", "1", "1"]), "2.00");
    assert.equal(mathDelMotor(["potencia", "2", "3"]), "0");
  });
  test("con menos de tres sólo hay sqrt y sin", () => {
    assert.equal(mathDelMotor(["sqrt", "16"]), "4.00");
    assert.equal(mathDelMotor(["add", "1"]), "0");
  });
  test("intdivide y mod truncan ANTES", () => {
    assert.equal(mathDelMotor(["intdivide", "7.9", "2.9"]), "3.00");
    assert.equal(mathDelMotor(["mod", "7.9", "2.9"]), "1.00");
  });
  test("y desde un guion, con las variables resueltas", () => {
    const { j } = jugadorCon(`{ e\n setvard A 2.5\n setvard B $math(multiply,A,4)\n}`);
    j.llamar("e");
    assert.equal(j.guion.vars.get("B"), "10.00");
  });
});

describe("$string_upto / $string_from (script.cpp:4116-4152)", () => {
  test("lo que hace base_dot: «poison_effect» hasta «_» es «poison»", () => {
    assert.equal(cadenaHasta("$string_upto", ["poison_effect", "_"]), "poison");
    assert.equal(cadenaHasta("$string_from", ["poison_effect", "_"]), "effect");
  });
  test("SIN lo buscado devuelve «0», no la cadena", () => {
    assert.equal(cadenaHasta("$string_upto", ["abc", "_"]), "0");
  });
  test("al principio, upto da vacío", () => {
    assert.equal(cadenaHasta("$string_upto", ["_abc", "_"]), "");
  });
});

describe("leerDano: las dos formas de daño, partidas enteras", () => {
  const partir = (linea) => {
    const c = partirGuion(`{ e\n ${linea}\n}`).eventos[0].cmds[0];
    return leerDano(c.nombre, c.params);
  };
  test("xdodamage directa, la de base_dot (8 parámetros: sin banderas)", () => {
    const d = partir("xdodamage ent_me direct 3 100 PentP(103,4) PentP(103,4) none poison_effect");
    assert.equal(d.forma, "directo");
    assert.equal(d.dano, 3);
    assert.equal(d.acierto, 100);
    assert.equal(d.tipo, "poison_effect");
    assert.equal(d.atacante, "PentP(103,4)");
    assert.equal(d.evento, null, "con 8 el motor lee una casilla de más; aquí, nada");
  });
  test("xdodamage con banderas en el noveno", () => {
    const d = partir("xdodamage ent_lastseen 40 5 90 ent_me ent_me none pierce dmgevent:bite;nodecal");
    assert.equal(d.forma, "traza");
    assert.equal(d.evento, "bite");
    assert.equal(d.sinCalcomania, true);
  });
  test("xdodamage en radio: acierto 100 siempre", () => {
    const d = partir("xdodamage (1,2,3) 128 10 0.5 ent_me ent_me none fire_effect");
    assert.equal(d.forma, "radio");
    assert.equal(d.acierto, 100);
    assert.equal(d.atenuacion, 0.5);
  });
  test("con menos de siete, nada (ERROR_MISSING_PARMS)", () => {
    assert.equal(partir("xdodamage ent_me direct 3 100 a b"), null);
  });
  test("dodamage directa con CINCO: el tipo es el asa del atacante (npcscript.cpp:1125-1140)", () => {
    const d = partir("dodamage ent_me direct 99999 100 GAME_MASTER");
    assert.equal(d.forma, "directo");
    assert.equal(d.tipo, "GAME_MASTER");
    assert.equal(d.atacante, "GAME_MASTER");
  });
  test("dodamage directa con seis: el sexto es el tipo", () => {
    assert.equal(partir("dodamage ent_me direct 99999 100 GAME_MASTER target").tipo, "target");
  });
  test("dodamage normal: tipo «generic» por omisión", () => {
    const d = partir("dodamage ent_lastseen 60 5 90");
    assert.equal(d.forma, "traza");
    assert.equal(d.tipo, "generic");
  });
  test("y en el intérprete, sin gancho de daño se APUNTA", () => {
    const { j } = jugadorCon(`{ e\n xdodamage ent_me direct 3 100 x x none poison_effect\n}`);
    j.llamar("e");
    assert.ok(j.guion.noSoportados.some((x) => x.nombre.startsWith("xdodamage")), JSON.stringify(j.guion.noSoportados));
  });
});

describe("scriptflags y $get_scriptflag: las banderas de la entidad", () => {
  test("add, name_value y type_exists, desde texto", () => {
    const { j } = jugadorCon(`{ e
 scriptflags ent_me add poison_effect;7 DOT_poison 3 10
 setvard V $get_scriptflag(ent_me,poison_effect;7,name_value)
 setvard T $get_scriptflag(ent_me,DOT_poison,type_exists)
 setvard N $get_scriptflag(ent_me,nada,name_value)
 setvard X $get_scriptflag(ent_me,nada,type_exists)
}`);
    j.llamar("e");
    assert.equal(j.guion.vars.get("V"), "3");
    assert.equal(j.guion.vars.get("T"), "1");
    assert.equal(j.guion.vars.get("N"), "none");
    assert.equal(j.guion.vars.get("X"), "0");
  });
  test("cada scriptflags llama game_scriptflag_update a la entidad, con la acción delante", () => {
    const { j } = jugadorCon(`{ e
 scriptflags ent_me add a t 3 10
}
{ game_scriptflag_update
 setvard VISTO PARAM1 PARAM2 PARAM3 PARAM4 PARAM5
}`);
    j.llamar("e");
    assert.equal(j.guion.vars.get("VISTO"), "addat310");
  });
  test("remove_expired: caduca con el reloj y llama game_scriptflag_expired", () => {
    const b = new BanderasDeEntidad();
    b.ejecutar(["x", "add", "n", "t", "1", "2"], 10);
    assert.equal(b.ejecutar(["x", "remove_expired"], 11.9).expirados.length, 0);
    const r = b.ejecutar(["x", "remove_expired"], 12.1);
    assert.equal(r.expirados.length, 1);
    assert.equal(b.lista.length, 0);
  });
  test("clearall borra la MITAD: el bucle del motor sube i mientras borra la casilla 0", () => {
    const b = new BanderasDeEntidad();
    for (const n of ["a", "b", "c", "d", "e"]) b.ejecutar(["x", "add", n, "t"], 0);
    b.ejecutar(["x", "clearall"], 0);
    assert.deepEqual(b.lista.map((x) => x.nombre), ["d", "e"]);
  });
  test("edit cambia el ÚLTIMO con ese nombre; add sin «stack» deja uno", () => {
    const b = new BanderasDeEntidad();
    b.ejecutar(["x", "add", "a", "t", "1"], 0);
    b.ejecutar(["x", "add", "a", "t", "2"], 0);
    assert.equal(b.lista.length, 1);
    b.ejecutar(["x", "add", "stack1", "t", "1"], 0);
    b.ejecutar(["x", "add", "stack1", "t", "2"], 0);
    b.ejecutar(["x", "edit", "stack1", "t", "9"], 0);
    assert.deepEqual(b.lista.filter((x) => x.nombre === "stack1").map((x) => x.valor), ["1", "9"]);
  });
});

describe("takedmg y $get_takedmg: las resistencias, del guion del jugador", () => {
  test("sin nada puesto, «1.0» literal (script.cpp:2588)", () => {
    const { j } = jugadorCon(`{ e\n setvard R $get_takedmg(ent_me,poison)\n}`);
    j.llamar("e");
    assert.equal(j.guion.vars.get("R"), "1.0");
  });
  test("`takedmg poison 0.5` desde su guion y `$get_takedmg` lo lee con «%.2f»", () => {
    const { j } = jugadorCon(`{ e\n takedmg poison 0.5\n setvard R $get_takedmg(ent_me,poison)\n setvard A $get_takedmg(ent_me,all)\n}`);
    j.llamar("e");
    assert.equal(j.guion.vars.get("R"), "0.50");
    assert.equal(j.guion.vars.get("A"), "1.00");
  });
  test("leer busca CONTIENE; el daño multiplica por PREFIJO", () => {
    const r = new ResistenciasDeEntidad();
    r.poner("poison_effect", 2);
    assert.equal(r.leer("poison"), "2.00", "«poison_effect» contiene «poison»");
    assert.equal(r.multiplicar(3, "poison"), 3, "«poison» no empieza por «poison_effect»");
    assert.equal(r.multiplicar(3, "poison_effect"), 6);
  });
  test("takedmg avisa con game_set_takedmg (npcscript.cpp:1096-1101)", () => {
    const { j } = jugadorCon(`{ e\n takedmg fire 0.25 adjust\n}\n{ game_set_takedmg\n setvard V PARAM1 PARAM2 PARAM3\n}`);
    j.llamar("e");
    assert.equal(j.guion.vars.get("V"), "fire0.250000adjust");
  });
});

describe("golpeDirecto: la parte de DoDamage que decide si entra", () => {
  const d = { dano: 3, acierto: 100, tipo: "poison_effect", multiplicaDe: "atacante" };
  test("sin atacante no hay daño (scriptcmds.cpp:7352)", () => {
    assert.equal(golpeDirecto({ d, atacante: { existe: () => false } }).entra, false);
  });
  test("con acierto 100 no falla nunca, ni con la tirada más baja", () => {
    assert.equal(golpeDirecto({ d, atacante: { existe: () => true }, azar: () => 0 }).entra, true);
  });
  test("con acierto 50 la tirada 49 falla y la 50 entra", () => {
    const d50 = { ...d, acierto: 50 };
    assert.equal(golpeDirecto({ d: d50, atacante: { existe: () => true }, azar: () => 49 }).entra, false);
    assert.equal(golpeDirecto({ d: d50, atacante: { existe: () => true }, azar: () => 50 }).entra, true);
  });
  test("el dmgmulti del atacante multiplica; un aliado no puede herir", () => {
    assert.equal(golpeDirecto({ d, atacante: { existe: () => true, multDano: 2 }, azar: () => 0 }).dano, 6);
    assert.equal(golpeDirecto({ d, atacante: { existe: () => true, puedeHerirAlAnfitrion: () => false } }).entra, false);
  });
  test("la relación en texto, como scriptcmds.cpp:1392-1414", () => {
    assert.equal(relacionEnTexto(RELACION.ODIO), "enemy");
    assert.equal(relacionEnTexto(RELACION.RECELO), "wary");
    assert.equal(relacionEnTexto(RELACION.ALIADO), "ally");
    assert.equal(relacionEnTexto(RELACION.SIN_RAZA), "neutral");
  });
});

// ── 2. EL VENENO DE VERDAD, SOBRE EL JUGADOR ───────────────────────────────

describe("effects/dot_poison de una araña de Gate City sobre el jugador", { skip: sinVeneno }, () => {
  const poner = (m, { dur = "5", dano = "3", arañaDe = null } = {}) => {
    const { i, razas } = arañaDe ?? arana();
    const ap = aplicadorDeBicho(i, { indice: 3, razas });
    const ef = m.j.efectos.aplicar("effects/dot_poison", [dur, ap.id, dano, "none"], { aplicador: ap });
    return { ef, ap, i, razas };
  };

  test("dice «You have been poisoned!» y NO «You resist the poison.»", () => {
    const m = jugadorCon("{ nada\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    poner(m);
    const textos = m.sucesos.map((s) => s.texto);
    assert.ok(textos.includes("normal: You have been poisoned!"), textos.join(" | "));
    assert.ok(!textos.some((x) => x.includes("resist")), textos.join(" | "));
  });

  test("hace 3 de daño cada segundo, empezando a los 0,5 s, cinco veces en 5 s", () => {
    // `callevent 0.5 dot_effect` y luego `callevent 1.0 dot_effect`
    // (effects/base_dot.script:45 y :65); la duración es PARAM1.
    const m = jugadorCon("{ nada\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    poner(m);
    m.avanzar(6);
    assert.equal(m.heridas.length, 5, JSON.stringify(m.heridas.map((h) => h.t.toFixed(2))));
    assert.ok(Math.abs(m.heridas[0].t - 0.5) < 0.15, `primera a ${m.heridas[0].t}`);
    for (let k = 1; k < m.heridas.length; k++) {
      const dt = m.heridas[k].t - m.heridas[k - 1].t;
      assert.ok(Math.abs(dt - 1) < 0.15, `entre golpes ${dt}`);
    }
    assert.ok(m.heridas.every((h) => h.dano === 3 && h.tipo === "poison_effect"));
    assert.equal(m.personaje.vida, 40 - 15);
  });

  test("el golpe viene de la araña, con su nombre: es quien firma el mensaje de daño", () => {
    const m = jugadorCon("{ nada\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    poner(m);
    m.avanzar(1);
    assert.equal(m.heridas[0].atacante.nombre, "Leaping Cave Spider");
  });

  test("al acabar se va: «The poison subsides.» y ya no está entre los activos", () => {
    const m = jugadorCon("{ nada\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    poner(m);
    m.avanzar(4.8);
    assert.equal(m.j.efectos.activos.length, 1);
    m.avanzar(1.0);
    assert.equal(m.j.efectos.activos.length, 0);
    assert.ok(m.sucesos.some((s) => s.texto === "normal: The poison subsides."));
    const antes = m.personaje.vida;
    m.avanzar(3);
    assert.equal(m.personaje.vida, antes, "y no sigue haciendo daño");
  });

  test("CONTROL NEGATIVO: sin veneno, en la misma ventana, la vida no se mueve", () => {
    const m = jugadorCon("{ nada\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    m.avanzar(6);
    assert.equal(m.heridas.length, 0);
    assert.equal(m.personaje.vida, 40);
  });

  test("INMUNE de verdad: con `takedmg poison 0` en su guion, ahora sí «You resist the poison.»", () => {
    // `if ( IMMUNE_RATIO == 0 )` (effects/base_dot.script:131). La frase es
    // del juego cuando la resistencia es del juego.
    const m = jugadorCon("{ inmune\n takedmg poison 0\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    m.j.llamar("inmune");
    poner(m);
    m.avanzar(3);
    assert.ok(m.sucesos.some((s) => s.texto === "bueno: You resist the poison."), m.sucesos.map((s) => s.texto).join(" | "));
    assert.equal(m.heridas.length, 0);
  });

  test("y una debilidad del guion multiplica el daño: `takedmg poison 2` -> 6 por golpe", () => {
    const m = jugadorCon("{ debil\n takedmg poison 2\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    m.j.llamar("debil");
    poner(m);
    m.avanzar(1);
    assert.equal(m.heridas[0].dano, 6);
  });

  test("el mismo veneno de la misma araña NO se apila: alarga (con $math) y sube el daño al mayor", () => {
    // `dot_scriptflag_check` (effects/base_dot.script:156-169): la bandera
    // «poison_effect;<índice>» ya está, el nuevo se quita y EDITA la bandera;
    // el viejo oye `game_scriptflag_update` y hace `effect_set_duration`.
    // Sin `$math` el fin del primero sería a los 5 s pase lo que pase.
    const m = jugadorCon("{ nada\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    const a = arana();
    poner(m, { arañaDe: a });
    m.avanzar(3);
    poner(m, { arañaDe: a, dano: "4" });
    assert.equal(m.j.efectos.activos.length, 1, "uno solo puesto");
    m.avanzar(4);
    assert.equal(m.j.efectos.activos.length, 1, "a los 7 s sigue: el fin pasó de 5 a 8");
    assert.equal(m.heridas.at(-1).dano, 4, "y pega con el mayor");
    m.avanzar(1.5);
    assert.equal(m.j.efectos.activos.length, 0);
  });

  test("y un TERCERO más flojo no baja el daño: compara con lo GUARDADO en la bandera", () => {
    // `if ( L_VALUE < DOT_DMG ) local L_VALUE DOT_DMG` (base_dot.script:166):
    // L_VALUE sale de la bandera, que el segundo EDITÓ a 4. Sin el `edit`
    // guardando el valor, la bandera seguiría en 3 y el tercero (2) dejaría
    // el veneno en 3. Esta prueba existe porque romper el `edit` dejó verde
    // la de arriba: el segundo pasa el daño por `game_scriptflag_update`, no
    // por lo guardado (scriptcmds.cpp:5437-5444).
    const m = jugadorCon("{ nada\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    const a = arana();
    poner(m, { arañaDe: a });
    m.avanzar(1);
    poner(m, { arañaDe: a, dano: "4" });
    m.avanzar(1);
    poner(m, { arañaDe: a, dano: "2" });
    m.avanzar(1);
    assert.equal(m.heridas.at(-1).dano, 4);
  });

  test("effect_spiderlatch pone dot_poison con la ARAÑA de atacante, no con el jugador", () => {
    const m = jugadorCon("{ nada\n}", { tabla: tablaDe(["effects/effect_spiderlatch", "effects/dot_poison"]) });
    const { i, razas } = arana();
    const ap = aplicadorDeBicho(i, { indice: 3, razas });
    m.j.efectos.aplicar("effects/effect_spiderlatch", ["5", ap.id, "2"], { aplicador: ap });
    m.avanzar(1);
    assert.deepEqual(m.j.efectos.activos.map((x) => x.id).sort(), ["DOT_poison", "effect_spiderlatch"]);
    assert.equal(m.heridas.length, 1);
    assert.equal(m.heridas[0].atacante.nombre, "Leaping Cave Spider");
  });

  test("con la araña ya BORRADA el veneno no hace daño (`if ( !Damage.pAttacker ) return 0`)", () => {
    const m = jugadorCon("{ nada\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    const { i } = poner(m);
    i.dormido = true;
    m.avanzar(3);
    assert.equal(m.heridas.length, 0);
  });

  test("lo que todavía falta en el veneno se apunta: el brillo, el fundido y el icono", () => {
    const m = jugadorCon("{ nada\n}", { tabla: tablaDe(["effects/dot_poison"]) });
    const { ef } = poner(m);
    const faltan = ef.guion.noSoportados.map((x) => x.nombre);
    assert.ok(faltan.includes("effect"), faltan.join(" "));
    assert.ok(faltan.includes("hud.addstatusicon"), faltan.join(" "));
    assert.ok(!faltan.includes("$get_takedmg") && !faltan.includes("$math") && !faltan.includes("$string_upto"), faltan.join(" "));
  });
});

describe("$can_damage y $get(<bicho>,dmgmulti), desde el guion de un efecto", { skip: sinVeneno }, () => {
  /** Un efecto escrito aquí, horneado en una tabla como los de verdad. */
  const conEfecto = (texto) => new TablaDeEfectos({ archivos: { "pruebas/efecto": { piezas: partirGuion(texto).piezas } } });
  test("la araña puede herir al jugador y el jugador a la araña viva; el multiplicador es «1.00»", () => {
    const tabla = conEfecto(`{
 setvar game.effect.id prueba
}
{ game_activate
 setvard ATK PARAM1
 setvard A $can_damage(ent_me,ATK)
 setvard B $can_damage(ATK)
 setvard M $get(ATK,dmgmulti)
}`);
    const m = jugadorCon("{ nada\n}", { tabla });
    const { i, razas } = arana();
    const ap = aplicadorDeBicho(i, { indice: 3, razas });
    const ef = m.j.efectos.aplicar("pruebas/efecto", [ap.id], { aplicador: ap });
    // El CÓDIGO del motor: `[quien]->CanDamage(<objetivo>)` (script.cpp:675-680).
    assert.equal(ef.guion.vars.get("A"), "1", "la araña (quien) puede herir al jugador (objetivo)");
    assert.equal(ef.guion.vars.get("B"), "1", "el jugador (quien llama) puede herir a la araña viva");
    assert.equal(ef.guion.vars.get("M"), "1.00");
    i.muerto = true;
    ef.llamar("game_activate", [ap.id]);
    assert.equal(ef.guion.vars.get("B"), "0", "muerta ya no recibe daño");
  });
});

test("los nuevos están en las listas (la suma la lleva test/juego_misiones.test.mjs)", () => {
  for (const c of ["dodamage", "xdodamage", "scriptflags", "takedmg"]) assert.ok(COMANDOS.has(c));
  for (const g of ["$get_takedmg", "$math", "$string_upto", "$string_from", "$get_scriptflag", "$pass", "$can_damage"]) assert.ok(GETTERS.has(g));
  assert.equal(flotanteDelMotor(-0), "-0.00");
});
