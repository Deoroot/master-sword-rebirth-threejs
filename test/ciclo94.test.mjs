// EL 94: CADA BICHO PIENSA CON EL RELOJ DE SU BASE.
//
// Hasta el 93 `Cazador.ciclo` devolvía `CICLO.ocioso` —2,0 s, el `const
// CYCLE_TIME_IDLE 2.0` de `base_npc_attack_new.script:95`— para TODOS los
// bichos. Pero Master Sword tiene dos IA de monstruo y la vieja, la que heredan
// la rata, la araña y el jabalí por `monsters/base_monster`
// (base_monster.script:8), escribe otro número:
//
//     setvard CYCLE_TIME_IDLE 2.8                 base_npc_attack.script:7
//     { hunting_mode_go  repeatdelay CYCLE_TIME   base_npc_attack.script:62-63
//
// Así que una araña sin objetivo miraba alrededor cada 2,0 s donde el mod la
// hace esperar 2,8. Ahora el número sale de la ficha (`iaDe`) y llega horneado.
//
// TODO ENTRA POR DONDE ENTRA EL JUEGO (CLAUDE.md §4, el 59): la ficha la lee
// `leerFichaNpc` de los guiones del mod, o es la del `bichos.json` horneado, y
// el reloj se mide por `Manada.cazar`, que es quien llama a `Cazador.tic` en
// la partida. Ninguna ficha escrita a mano lleva un `cicloOcioso`.
//
// Y DOS CASOS SIEMPRE (el 50): la vieja y la nueva lado a lado. Con un solo
// bicho de la nueva, el valor correcto y el de reposo (2,0) son el mismo.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { leerFichaNpc, modeloYAnimaciones, iaDe } from "../src/bsp/script.js";
import { Manada } from "../src/play/manada.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const HAY_MOD = existsSync(SCRIPTS);
const ficha = (g) => modeloYAnimaciones(leerFichaNpc(SCRIPTS, g));

// Los números del mod, ESCRITOS A MANO con su cita (el 75): pedírselos a la
// misma función que se mide no mediría nada.
const VIEJA = { ocioso: 2.8, combate: 0.1 };   // base_npc_attack.script:7, :10
const NUEVA = { ocioso: 2.0, combate: 0.1 };   // base_npc_attack_new.script:95, :94

describe("1. la ficha trae el reloj de su base (iaDe)", { skip: !HAY_MOD }, () => {
  test("la IA VIEJA: rata, araña, cría de araña, jabalí → 2,8 s", () => {
    for (const g of ["monsters/giantrat", "monsters/spider", "monsters/spider_mini", "monsters/boar"]) {
      const ia = ficha(g).ia;
      assert.equal(ia.cicloOcioso, VIEJA.ocioso, g);
      assert.equal(ia.cicloCombate, VIEJA.combate, g);
    }
  });

  test("la IA NUEVA: goblin, zombi enano → 2,0 s (el segundo caso)", () => {
    for (const g of ["monsters/goblin", "monsters/dwarf_zombie_random"]) {
      const ia = ficha(g).ia;
      assert.equal(ia.cicloOcioso, NUEVA.ocioso, g);
      assert.equal(ia.cicloCombate, NUEVA.combate, g);
    }
  });

  test("un invocado pone el suyo ANTES del include y gana (const, el 66): 0,1 s", () => {
    // monsters/summon/base_summon.script:49-51, `const CYCLE_TIME_IDLE 0.1`.
    // Es el tercer valor del juego y dice que no se lee «de la base» a ciegas.
    // `iaDe` directo: la plantilla no trae `setmodel` y `modeloYAnimaciones`
    // la descarta, pero la ficha de combate es la misma función.
    assert.equal(iaDe(leerFichaNpc(SCRIPTS, "monsters/summon/base_summon")).cicloOcioso, 0.1);
    assert.equal(iaDe(leerFichaNpc(SCRIPTS, "monsters/summon/snake_cursed")).cicloOcioso, 0.1);
  });

  test("un aldeano que no hereda ninguna base no trae reloj (null, no un 2,0 inventado)", () => {
    // NPCs/default_dwarf no incluye base_npc_attack ni _new: en el mod no hay
    // `npcatk_hunt` para él.
    assert.equal(ficha("NPCs/default_dwarf").ia.cicloOcioso, null);
  });
});

// ── EL ORÁCULO INDEPENDIENTE: la cadena de `#include` leída a pelo ──────────
//
// `iaDe` lee el valor con el intérprete de `variablesAlNacer`. Esto lo comprueba
// con OTRO instrumento: seguir los `#include` del texto hasta encontrar una de
// las dos bases. Si los dos coinciden en todos los bichos horneados, el número
// no depende de que el intérprete acierte.
function baseDe(guion, vistos = new Set()) {
  const clave = guion.toLowerCase();
  if (vistos.has(clave)) return null;
  vistos.add(clave);
  if (clave === "monsters/base_npc_attack") return "vieja";
  if (clave === "monsters/base_npc_attack_new") return "nueva";
  const ruta = join(SCRIPTS, `${guion}.script`);
  if (!existsSync(ruta)) return null;
  const texto = readFileSync(ruta, "latin1");
  for (const l of texto.split(/\r?\n/)) {
    const m = l.match(/^\s*#include\s+(?:\[\w+\]\s+)?(\S+)/i);
    if (!m) continue;
    const b = baseDe(m[1], vistos);
    if (b) return b;
  }
  return null;
}

const MAPAS = ["gatecity", "edana", "edanasewers", "gertenheld_forest2", "sala88"];
const horneado = (m) => {
  const r = `build/${m}/bichos.json`;
  return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
};

describe("2. el horneado de los cinco mapas, contra la cadena de includes", { skip: !HAY_MOD }, () => {
  for (const m of MAPAS) {
    test(`${m}: cada bicho piensa con el reloj de su base`, (t) => {
      const j = horneado(m);
      if (!j) return t.skip(`sin build/${m}/bichos.json`);
      const cuenta = { vieja: 0, nueva: 0, ninguna: 0 };
      for (const c of j.colocados) {
        const b = baseDe(c.script);
        cuenta[b ?? "ninguna"]++;
        // Un `const` propio antes del include gana (base_summon); en estos
        // cinco mapas no hay ninguno, y si lo hubiera esto lo diría en rojo.
        const esperado = b === "vieja" ? VIEJA.ocioso : b === "nueva" ? NUEVA.ocioso : null;
        assert.equal(c.ia?.cicloOcioso ?? null, esperado, `${m} ${c.script} (${b ?? "sin base"})`);
      }
      // Se dice cuántos de cada, para que un mapa con cero de una base no pase
      // por «comprobado» (el 63: un filtro que tira en silencio).
      t.diagnostic(`${m}: vieja ${cuenta.vieja}, nueva ${cuenta.nueva}, sin base ${cuenta.ninguna}`);
    });
  }

  test("CONTROL: entre los cinco mapas hay bichos de LAS DOS bases", (t) => {
    const hay = { vieja: 0, nueva: 0 };
    for (const m of MAPAS) {
      for (const c of horneado(m)?.colocados ?? []) {
        const b = baseDe(c.script);
        if (b) hay[b]++;
      }
    }
    if (!hay.vieja && !hay.nueva) return t.skip("sin horneado");
    assert.ok(hay.vieja > 0 && hay.nueva > 0, JSON.stringify(hay));
  });
});

// ── 3. EL RELOJ, MEDIDO POR DONDE PIENSA EL JUEGO ───────────────────────────
//
// Un bicho del `bichos.json` de Gate City, tal como lo coloca el juego (sin su
// aparecedor, para que esté despierto desde el primer paso), en una `Manada` de
// verdad. El primer paso piensa —el reloj nace a cero— sin nadie a la vista;
// desde ahí se pone al jugador delante y se cuentan pasos de 1/60 hasta que lo
// fija. Esa espera es el ciclo ocioso entero (crias93f.test.mjs, el 93).

const DT = 1 / 60;   // el paso fijo del juego, src/main.js:161

function manadaDe(script) {
  const j = horneado("gatecity");
  const c = j.colocados.find((x) => x.script === script);
  assert.ok(c, `${script} está en Gate City`);
  const m = new Manada({ ...j, colocados: [{ ...c, aparecedor: null }] }, {
    cajasPorClave: new Map([[c.clave, { min: [-16, -16, 0], max: [16, 16, 32] }]]),
    azar: () => 0.5,
  });
  return m;
}

function esperaHastaVerte(script) {
  const m = manadaDe(script);
  const i = m.instancias[0];
  assert.equal(i.dormido, false, "despierto");
  const U = m.U;
  let visible = false;
  const arnes = {
    libre: () => true, suelo: () => 0, veA: () => true, golpear: () => {},
    // El jugador, a 2 m delante del bicho, con la relación que horneó el mapa.
    objetivos: (b) => (visible
      ? [{ id: "jugador", donde: [b.donde[0] * U + 79, b.donde[1] * U + 36, b.donde[2] * U],
        esJugador: true, relacion: b.ficha.relacion, ancho: 0 }]
      : []),
  };
  // CORRECCIÓN DEL 95: «el reloj nace a cero» dejó de ser verdad: el primer
  // pensamiento espera 0,75 s (nueva) o 2,8 s (vieja), ver test/ia95. Así que
  // se dan pasos sin nadie a la vista HASTA que piensa por primera vez —el
  // reloj salta hacia arriba al reprogramarse— y desde ahí se mide el ciclo.
  // Antes era un solo paso, y con el goblin daba 0,75 en vez de 2,0.
  let pensado = false;
  for (let k = 0; k < 400 && !pensado; k++) {
    const antes = i.cazador.reloj;
    m.relojes(DT);
    m.cazar(DT, arnes);                     // el primer pensamiento, sin nadie
    pensado = i.cazador.reloj > antes;
  }
  assert.ok(pensado, "ha pensado una vez sin nadie a la vista");
  assert.equal(i.cazador.objetivo, null);
  visible = true;
  for (let k = 1; k <= 400; k++) {
    m.relojes(DT);
    m.cazar(DT, arnes);
    if (i.cazador.objetivo === "jugador") return k * DT;
  }
  return null;
}

describe("3. por `Manada.cazar`: cuánto tarda en verte un bicho ocioso", { skip: !HAY_MOD }, () => {
  test("la cría de araña (IA vieja) tarda 2,8 s", (t) => {
    if (!horneado("gatecity")) return t.skip("sin horneado");
    const s = esperaHastaVerte("monsters/spider_mini");
    assert.ok(s !== null, "la ve");
    // Un paso de holgura: el borde del 81 (2,8 − 168/60 en coma flotante).
    assert.ok(Math.abs(s - VIEJA.ocioso) <= DT + 1e-9, `tardó ${s.toFixed(3)} s`);
  });

  test("el goblin (IA nueva) tarda 2,0 s — el segundo caso, y el control de que se distinguen", (t) => {
    if (!horneado("gatecity")) return t.skip("sin horneado");
    const s = esperaHastaVerte("monsters/goblin");
    assert.ok(s !== null, "la ve");
    assert.ok(Math.abs(s - NUEVA.ocioso) <= DT + 1e-9, `tardó ${s.toFixed(3)} s`);
  });

  test("con objetivo, las dos piensan cada 0,1 s", (t) => {
    if (!horneado("gatecity")) return t.skip("sin horneado");
    for (const s of ["monsters/spider_mini", "monsters/goblin"]) {
      const m = manadaDe(s);
      const c = m.instancias[0].cazador;
      c.apuntarA("jugador");
      assert.equal(c.ciclo, VIEJA.combate, s);
    }
  });
});
