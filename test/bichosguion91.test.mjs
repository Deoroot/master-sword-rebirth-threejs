// EL CENSO DE LOS GUIONES DE MONSTRUO — el 91. `tools/bichosguion.mjs`.
//
// Lo que se prueba es que el censo MIDE, no que imprime: cada control lleva al
// lado el caso que demuestra que habría visto lo contrario (el apartado 4 de
// CLAUDE.md). Los que leen `../MSC/` se saltan si no está.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { partirGuion, COMANDOS, GETTERS, PROPIEDADES } from "../src/play/guion.js";
import {
  sinComentariosConLineas, llamadasDelMotor, comprobarCitas, EVENTOS_DE_MONSTRUO,
  analizar, censarGuion, lectorConCache, RAIZ_MOD, RAIZ_GUIONES, RAIZ_MODELOS,
} from "../tools/bichosguion.mjs";

const hayMod = existsSync(RAIZ_MOD);
const hayGuiones = existsSync(join(RAIZ_GUIONES, "monsters", "giantrat.script"));
const hayModelos = existsSync(join(RAIZ_MODELOS, "monsters", "giant_rat.mdl"));

/** Un guion de texto, analizado por el analizador de verdad (la lección del 67). */
const deTexto = (t, portado) => {
  const p = partirGuion(t);
  return analizar({ eventos: p.eventos, preload: p.preload }, portado);
};

describe("los comentarios de C++ se quitan sin mover las líneas", () => {
  test("un `/*` dentro de un `//` NO abre un bloque (el fallo de `//**** TAKEDMG ****`)", () => {
    const cpp = [
      "//******************************* TAKEDMG ****************************",
      "int a;",
      'CallScriptEvent("game_set_takedmg", &P);',
      "/* de verdad comentado",
      'CallScriptEvent("game_attacked");',
      "*/",
      'CallScriptEvent("game_struck"); // y un */ suelto aquí no cierra nada',
    ].join("\n");
    const s = sinComentariosConLineas(cpp).split("\n");
    assert.equal(s.length, 7, "las líneas tienen que seguir siendo siete");
    assert.match(s[2], /game_set_takedmg/, "lo de debajo de la cabecera de asteriscos sigue vivo");
    assert.doesNotMatch(s[4], /game_attacked/, "y lo de dentro de un /* */ de verdad se va");
    assert.match(s[6], /game_struck/);
  });
});

describe("los eventos que el motor dispara a un monstruo, contra el C++", { skip: !hayMod }, () => {
  const llamadas = hayMod ? llamadasDelMotor() : [];

  test("todas las citas de EVENTOS_DE_MONSTRUO casan con una llamada viva", () => {
    assert.deepEqual(comprobarCitas(llamadas).map((e) => `${e.nombre} ${e.cita}`), []);
  });

  test("game_struck está en msmonsterserver.cpp:2385 (control positivo)", () => {
    assert.ok(llamadas.some((l) => l.nombre === "game_struck" && l.archivo === "server/monsters/msmonsterserver.cpp" && l.linea === 2385));
  });

  test("game_attacked NO está vivo, aunque el TEXTO lo nombre (está comentado)", () => {
    const crudo = readFileSync(join(RAIZ_MOD, "server/monsters/msmonsterserver.cpp"), "latin1");
    assert.match(crudo, /CallScriptEvent\(\s*"game_attacked"/, "el texto crudo lo tiene: si no, este control no mide nada");
    assert.ok(!llamadas.some((l) => l.nombre === "game_attacked" && l.archivo === "server/monsters/msmonsterserver.cpp"));
  });

  test("una cita inventada sale como que no casa", () => {
    const falsa = { nombre: "game_struck", cita: "server/monsters/msmonsterserver.cpp:1" };
    EVENTOS_DE_MONSTRUO.push(falsa);
    try { assert.ok(comprobarCitas(llamadas).includes(falsa)); }
    finally { EVENTOS_DE_MONSTRUO.pop(); }
  });
});

describe("lo que está y lo que no está portado", () => {
  const t = "{\n  setvard A 1\n  comando_inventado_91 x\n  local B $vec(1,2,3)\n}\n";

  test("`setvard` se usa y NO sale como no portado", () => {
    const a = deTexto(t);
    assert.ok(a.usados.cmds.includes("setvard"), "el guion lo usa: si no, el control no mide nada");
    assert.ok(!a.falta.cmds.includes("setvard"));
    assert.ok(COMANDOS.has("setvard"));
  });

  test("y quitándolo del conjunto portado, SÍ sale (el filtro filtra)", () => {
    const sin = new Set([...COMANDOS].filter((c) => c !== "setvard"));
    const a = deTexto(t, { comandos: sin, getters: GETTERS, propiedades: PROPIEDADES });
    assert.ok(a.falta.cmds.includes("setvard"));
  });

  test("un comando que no existe sale como no portado, y un getter sin portar también", () => {
    const a = deTexto(t);
    assert.ok(a.falta.cmds.includes("comando_inventado_91"));
    if (!GETTERS.has("$vec")) assert.ok(a.falta.getters.includes("$vec"));
  });
});

describe("los bucles que se reprograman solos", () => {
  test("callevent con retraso a sí mismo, con número y con variable; sin retraso no", () => {
    const a = deTexto([
      "{ bucle_num", "  callevent 2.0 bucle_num", "}",
      "{ bucle_var", "  callevent FREQ_X bucle_var", "}",
      "{ llama_a_otro", "  callevent bucle_num", "}",
      "{ ida", "  callevent 1 vuelta", "}",
      "{ vuelta", "  callevent ida", "}",
      "{", "  repeatdelay 5", "}",
    ].join("\n"));
    assert.deepEqual(a.bucles.propios.sort(), ["bucle_num", "bucle_var"]);
    assert.ok(a.bucles.ciclos.includes("ida") && a.bucles.ciclos.includes("vuelta"), "ida->1s->vuelta->ida es un ciclo con tramo diferido");
    assert.ok(!a.bucles.ciclos.includes("llama_a_otro"));
    assert.deepEqual(a.bucles.repeatdelay, ["(sin nombre)"]);
  });
});

describe("casos conocidos a mano, sobre los guiones del juego", { skip: !hayGuiones }, () => {
  const leer = hayGuiones ? lectorConCache() : null;

  test("monsters/giantrat declara `bite1` con `eventname` (giantrat.script:65)", () => {
    const texto = readFileSync(join(RAIZ_GUIONES, "monsters", "giantrat.script"), "latin1").split(/\r?\n/);
    assert.match(texto[64], /eventname bite1/, "la línea 65 es la que dice el encargo");
    const c = censarGuion("monsters/giantrat", { leer });
    assert.ok(c.propio.eventos.includes("bite1"));
    assert.ok(c.porEvento.bite1, "y está en el guion resuelto");
    assert.equal(c.hp, 4);
    // Un bicho de verdad heredando: el game_struck es de la plantilla.
    assert.ok(c.delMotor.includes("game_struck"));
    assert.ok(!c.propio.delMotor.includes("game_struck"));
  });

  test("y su modelo llama a `bite1` con un evento 500/600, que el guion maneja", { skip: !hayModelos }, () => {
    const c = censarGuion("monsters/giantrat", { leer });
    assert.equal(c.modelo, "monsters/giant_rat.mdl");
    assert.ok(c.anim.llaman.includes("bite1"));
    assert.ok(c.anim.manejados.includes("bite1"));
    // Control negativo del mismo modelo: pide eventos que la rata no tiene
    // (es un modelo compartido), y esos salen sin manejar.
    assert.ok(c.anim.sinManejar.length > 0);
    assert.ok(!c.anim.sinManejar.includes("bite1"));
  });

  test("la cobra envenena: `effects/dot_poison` dentro de un if() de una línea (cobra.script:53)", () => {
    const c = censarGuion("monsters/cobra", { leer });
    assert.ok(c.propio.efectos.literal.includes("effects/dot_poison"));
    // Control: la rata no aplica nada en su archivo propio.
    const rata = censarGuion("monsters/giantrat", { leer });
    assert.deepEqual(rata.propio.efectos.literal, []);
  });
});
