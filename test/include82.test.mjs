// EXPERIMENTO 82 · `#include [server] X`: el corchete se comía la ruta.
//
// La regla está citada en `src/bsp/script.js`, en `partirScript`. Lo que se
// mide aquí es el EFECTO, y por eso casi ninguna de estas pruebas llama a
// `includeDe`: entran por `leerFichaNpc` y `leerFichaObjeto`, que es por donde
// entra el juego. Las cuatro que le dan texto suelto están al final y son las
// que fijan la regla del motor, token a token.
//
// ── POR QUÉ NO VALE CONSTRUIR EL CASO A MANO ───────────────────────────────
//
// Porque es la trampa del 59 y del 63, que en este proyecto ha caído tres
// veces: una prueba que escribe `{ tipo: "include", ruta: "monsters/externals" }`
// mide que el recolector sabe seguir una ruta, no que el que parte la línea le
// da la ruta buena — y lo que estaba roto era justo eso. Así que el texto se lo
// parte el analizador, y los nombres de fichero son los del mod de verdad.
//
// ── Y POR QUÉ HAY UN CONTROL NEGATIVO ─────────────────────────────────────
//
// Porque «entran más eventos» lo cumpliría igual una versión que se tragara el
// corchete y metiera TODO, `[client]` incluido. Los seis `#include [client]`
// del mod están en `player/player.script` y en `world.script`, y ninguno de los
// dos debe entrar aquí: este puerto es el servidor (`game.serverside` → «1»,
// `guion.js:643`). Sin ese control, el verde no distingue «lee el ámbito» de
// «ignora el ámbito».

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { includeDe, partirScript, leerFichaNpc, leerFichaObjeto } from "../src/bsp/script.js";
import { leerBsp, leerEntidades } from "../src/bsp/lector.js";

const SCRIPTS = process.env.MSR_SCRIPTS ?? "../MSC/MSCScripts/scripts";
const MAPAS = `${process.env.MSR_ASSETS ?? "../MSC/assets/msr"}/maps`;
const hayMod = existsSync(`${SCRIPTS}/monsters/base_npc.script`);
const hayMapas = existsSync(MAPAS);

describe("EL CORCHETE SE COMÍA LA RUTA: `#include [server] monsters/externals`", () => {
  test("`base_npc` incluye `externals` y `base_self_adjust`, y los dos llegan", { skip: !hayMod }, () => {
    // Las dos líneas, tal como están escritas en el mod:
    //     #include [server] monsters/externals
    //     #include [server] monsters/base_self_adjust     base_npc.script:7-8
    const texto = readFileSync(`${SCRIPTS}/monsters/base_npc.script`, "latin1");
    const { incluye } = partirScript(texto);
    assert.ok(incluye.includes("monsters/externals"), `incluye = ${JSON.stringify(incluye)}`);
    assert.ok(incluye.includes("monsters/base_self_adjust"));
    // Y el control que de verdad separa el antes del después: **ningún
    // `[server]` sobrevive como si fuera una ruta**. Eso es lo que había.
    for (const r of incluye) assert.ok(!r.startsWith("["), `ruta con corchete: ${r}`);
  });

  test("la ARAÑA de Gate City pasa de una docena de eventos a trescientos", { skip: !hayMod }, () => {
    // `monsters/spider` es el guion de tres de los bichos de Gate City (el 67:
    // su `classname` dice `msmonster_skeleton`). Su cadena de `#include` llega
    // a `base_npc`, y de ahí a los dos de arriba.
    const f = leerFichaNpc(SCRIPTS, "monsters/spider");
    assert.ok(f, "no está el guion de la araña");
    const eventos = [...f.eventos.keys()];
    // El número exacto no se escribe: lo que se exige es el orden de magnitud,
    // porque lo que estaba roto dejaba 13. Un umbral de 100 no lo pasa ni de
    // casualidad una cadena cortada.
    assert.ok(eventos.length > 100, `sólo ${eventos.length} eventos`);
    // Los tres que importan para el canal `params` del 82, por su nombre:
    assert.ok(eventos.includes("game_postspawn"), "sin game_postspawn");
    assert.ok(eventos.includes("npcatk_do_events"), "sin el reparto de params");
    assert.ok(eventos.includes("set_no_roam"), "sin los set_* de externals");
  });

  test("CONTROL NEGATIVO: un `#include [client]` NO entra", { skip: !hayMod }, () => {
    // `player/player.script:19-24`, seis líneas. Este puerto es el servidor, y
    // `MSGlobals::IsServer == (Scope == EVENTSCOPE_SERVER)` las deja fuera.
    const { incluye, piezas } = partirScript(readFileSync(`${SCRIPTS}/player/player.script`, "latin1"));
    assert.ok(!incluye.includes("player/player_cl_main"), "entró un [client]");
    assert.ok(!incluye.includes("player/client/halos"));
    // Pero SÍ se apunta en `piezas` con su ámbito: un descarte en silencio es
    // el sitio donde cabe un pueblo (el 63), así que queda dicho que estaba.
    const cliente = piezas.filter((p) => p.tipo === "include" && p.ambito === "cliente");
    assert.equal(cliente.length, 5, `[client] apuntados: ${cliente.length}`);
    assert.ok(cliente.some((p) => p.ruta === "player/player_cl_main"));
    // Y los `[server]` del mismo fichero sí entran: así el control no puede
    // pasar por «no entra ninguno».
    assert.ok(incluye.length > 0, "no entró ningún include de player.script");
  });

  test("las ARMADURAS recuperan su base, que venía por `[shared]`", { skip: !hayMod }, () => {
    // `items/armor_belmont.script:22` → `#include [shared] items/armor_base`.
    // `[shared]` entra siempre, y entraba tan poco como el resto.
    const f = leerFichaObjeto(SCRIPTS, "items/armor_belmont");
    assert.ok(f, "no está la armadura");
    assert.ok(f.hereda.includes("items/armor_base"), `hereda = ${JSON.stringify(f.hereda)}`);
    // Y lo que eso vale en una partida, que es lo que hay que medir y no la
    // lista de ficheros: las ranuras que ocupa y que sea vestible salen de
    // `armor_base`. Sin él, la Armor of Bravery no se puede poner.
    assert.equal(f.vestible, true, "la armadura no es vestible");
    assert.deepEqual([...f.ranuras], ["chest", "arms", "legs"]);
  });

  test("y `faltan` ya no apunta un nombre EN BLANCO", { skip: !hayMod }, () => {
    // El lector de objetos quitaba el corchete de una cadena que era SÓLO el
    // corchete, así que la ruta quedaba vacía y el aviso se apuntaba sin
    // nombre. Un aviso sin nombre no lo lee nadie: era el hueco tapándose solo.
    const f = leerFichaObjeto(SCRIPTS, "items/armor_belmont");
    for (const r of f.faltan) assert.notEqual(String(r).trim(), "", "un `faltan` sin nombre");
  });
});

describe("EL CENSO, que se cuenta y no se escribe", () => {
  // Cuántas criaturas de los 93 mapas cuelgan de un guion con corchete. No se
  // escribe el número: se calcula, para que no envejezca solo (apartado 5 de
  // CLAUDE.md). Lo que se exige es que sea la mayoría, porque eso es lo que
  // hace que esto sea un agujero y no un detalle.
  const ES_BICHO = /^(msmonster_|msnpc_|ms_npc$|msworlditem_)/;

  test("la mayoría de las criaturas del juego cuelgan de un `#include` con ámbito", { skip: !(hayMod && hayMapas) }, () => {
    const cache = new Map();
    const alcanza = (ruta, vistos = new Set(), hondo = 0) => {
      if (hondo > 8) return false;
      const f = `${SCRIPTS}/${String(ruta).replace(/\\/g, "/")}.script`;
      if (!existsSync(f) || vistos.has(f)) return false;
      vistos.add(f);
      const { piezas } = partirScript(readFileSync(f, "latin1"));
      for (const p of piezas) {
        if (p.tipo !== "include") continue;
        if (p.ambito !== "compartido") return true;        // trae corchete
        if (alcanza(p.ruta, vistos, hondo + 1)) return true;
      }
      return false;
    };
    const conCorchete = (g) => {
      if (!cache.has(g)) cache.set(g, alcanza(g));
      return cache.get(g);
    };

    let total = 0, afectadas = 0;
    const mapas = new Set();
    for (const nombre of readdirSync(MAPAS).filter((x) => x.endsWith(".bsp"))) {
      let ents;
      try { ents = leerEntidades(leerBsp(`${MAPAS}/${nombre}`)); } catch { continue; }
      for (const e of ents) {
        if (!ES_BICHO.test(e.classname ?? "")) continue;
        const g = e.scriptfile || e.defscriptfile;
        if (!g) continue;
        total++;
        if (conCorchete(g)) { afectadas++; mapas.add(nombre); }
      }
    }
    assert.ok(total > 5000, `sólo ${total} criaturas leídas`);
    assert.ok(afectadas > total / 2, `${afectadas} de ${total}`);
    // Y la parte que más importa del censo: **no es cosa del segundo mapa**.
    // Gate City, el primero y el único que se miró durante 81 experimentos,
    // tiene la mayoría de los suyos dentro.
    assert.ok(mapas.size > 80, `sólo ${mapas.size} mapas`);
    const gc = leerEntidades(leerBsp(`${MAPAS}/gatecity.bsp`))
      .filter((e) => ES_BICHO.test(e.classname ?? "") && (e.scriptfile || e.defscriptfile));
    const gcAfect = gc.filter((e) => conCorchete(e.scriptfile || e.defscriptfile)).length;
    assert.ok(gcAfect > gc.length / 2, `Gate City: ${gcAfect} de ${gc.length}`);
  });
});

describe("LA REGLA DEL MOTOR, token a token (script.cpp:5229-5246)", () => {
  // Éstas sí le dan texto suelto a `includeDe`, porque lo que fijan es la
  // regla y no el efecto. El efecto lo miden las de arriba, contra el mod.
  test("sin corchete: la ruta es el primer token y el ámbito es compartido", () => {
    assert.deepEqual(includeDe("monsters/base_npc"), { ruta: "monsters/base_npc", ambito: "compartido" });
  });

  test("con corchete: la ruta es el token SIGUIENTE", () => {
    assert.deepEqual(includeDe("[server] monsters/externals"), { ruta: "monsters/externals", ambito: "servidor" });
    assert.deepEqual(includeDe("[client] player/player_cl_main"), { ruta: "player/player_cl_main", ambito: "cliente" });
    assert.deepEqual(includeDe("[shared] items/armor_base"), { ruta: "items/armor_base", ambito: "compartido" });
  });

  test("`[casual]` no es un ámbito: es «si no está, no pasa nada»", () => {
    // El motor lo mira con `contains`, no con `==`, así que puede venir pegado
    // a otro y los dos cuentan. `monsters/externals.script:3` trae uno suelto.
    assert.deepEqual(includeDe("[casual] test_scripts/npc_externals"),
      { ruta: "test_scripts/npc_externals", ambito: "compartido" });
    assert.deepEqual(includeDe("[server][casual] a/b"), { ruta: "a/b", ambito: "servidor" });
  });

  test("el tercer token (`allowduplicate`) no es parte de la ruta", () => {
    // No se porta —ver `partirScript`—, pero tampoco se pega al nombre del
    // fichero, que es lo que lo convertiría en un fichero que no existe.
    assert.equal(includeDe("[shared] items/armor_base allowduplicate").ruta, "items/armor_base");
    assert.equal(includeDe("monsters/base_npc allowduplicate").ruta, "monsters/base_npc");
  });

  test("una línea sin ruta no inventa una", () => {
    assert.equal(includeDe("[server]").ruta, null);
    assert.equal(includeDe("").ruta, null);
  });
});
