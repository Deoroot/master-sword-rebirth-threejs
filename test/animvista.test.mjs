// LA SECUENCIA DEL MODELO DE VISTA DE CADA ATAQUE.
//
// La pone el `playviewanim` del evento `<retorno>_start` del guion del arma
// (giattack.cpp:345; genericitem.cpp:2015-2033), no un campo del ataque. Ver
// tools/animvista.mjs y `Brazo.vistaDe` (src/play/golpe.js).
//
// Por donde entra el juego (CLAUDE.md §4, el 59 y el 67):
//
//   - el intérprete se prueba dándole TEXTO, partido por el analizador;
//   - la regla, sobre los guiones del juego de verdad (`../MSC/`), con los
//     números esperados escritos A MANO y su cita al lado (el 75);
//   - el brazo, con un `Brazo` de verdad sobre la ficha HORNEADA
//     (`build/msr/armas.json`) y `tic` paso a paso, como `pasoDelBrazo`.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Guion, partirGuion, entornoVacio } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";
import { leerFichaObjeto } from "../src/bsp/script.js";
import { Brazo } from "../src/play/golpe.js";
import { vistaDeArma, vistaDeRetorno } from "../tools/animvista.mjs";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const sinScripts = !existsSync(`${SCRIPTS}/items/swords_blood_drinker.script`) && "sin ../MSC/MSCScripts";
const RAIZ_REPO = fileURLToPath(new URL("..", import.meta.url));
const ARMAS = join(RAIZ_REPO, "build/msr/armas.json");
const cat = existsSync(ARMAS) ? JSON.parse(readFileSync(ARMAS, "utf8")) : null;
const sinArmas = !(cat?.resumen?.vistas) && "sin build/msr/armas.json con las vistas (npm run armas)";
const armaDe = (id) => cat.armas.find((a) => a.id === id);
const DT = 1 / 60;

/** Un guion desde TEXTO, partido por el analizador (CLAUDE.md §4, el 67). */
const guionDe = (texto) => resolverGuion("x", (ruta) => (ruta === "x" ? partirGuion(texto) : null), new Set());
const ATAQUE = "{ game_spawn\n\tlocal reg.attack.callback melee\n\tregisterattack\n}\n";

// ── 1. EL INTÉRPRETE DEL HORNEADO: las dos cosas que hace distinto ──────────

describe("`const A B` se resuelve al cargar (script.cpp:5410, :40-41, :349-354)", () => {
  test("`const MELEE_VIEWANIM_ATK ANIM_ATTACK1` vale 2: el `_start` pone la 2, no la 0", () => {
    const g = guionDe(`{\n\tconst ANIM_ATTACK1 2\n\tconst MELEE_VIEWANIM_ATK ANIM_ATTACK1\n}\n${ATAQUE}{ melee_start\n\tplayviewanim MELEE_VIEWANIM_ATK\n}\n`);
    const v = vistaDeRetorno(g, "melee");
    assert.deepEqual(v.secuencias, [2]);
    assert.equal(v.sinResolver, false);
  });

  test("y `const` sigue ganando el PRIMERO: la del arma, antes de la plantilla, manda", () => {
    const g = guionDe(`{\n\tconst ANIM_ATTACK1 7\n}\n{\n\tconst ANIM_ATTACK1 2\n\tconst MELEE_VIEWANIM_ATK ANIM_ATTACK1\n}\n${ATAQUE}{ melee_start\n\tplayviewanim MELEE_VIEWANIM_ATK\n}\n`);
    assert.deepEqual(vistaDeRetorno(g, "melee").secuencias, [7]);
  });

  test("lo que no se resuelve a un número SE DICE: `sinResolver`, y no pasa por «la 0»", () => {
    const g = guionDe(`${ATAQUE}{ melee_start\n\tplayviewanim NADIE_ME_DECLARA\n}\n`);
    const v = vistaDeRetorno(g, "melee");
    assert.deepEqual(v.secuencias, [0], "`atoi` de un nombre es 0, que es lo que haría el motor");
    assert.equal(v.sinResolver, true);
  });

  // EL HUECO, que NO es de esta prueba y se deja dicho: el `Guion` general —el
  // que corre jugando para el jugador, los NPC y los objetos— guarda el NOMBRE
  // y no el valor. `cargarCabecera` (src/play/efectos.js) lo hace bien desde el
  // 97 SÓLO para los efectos, y dice por qué: cambiarlo para todos mueve
  // números en todos los mapas. Es decisión del usuario; el día que se tome,
  // este `todo` se pone verde solo.
  test("PENDIENTE: el intérprete general hace lo mismo al cargar", { todo: "decisión del usuario: cambia la carga de todos los guiones" }, () => {
    const r = guionDe("{\n\tconst ANIM_ATTACK1 2\n\tconst MELEE_VIEWANIM_ATK ANIM_ATTACK1\n}\n");
    const g = new Guion({ eventos: r.eventos, preload: r.preload, entorno: entornoVacio() });
    assert.equal(g.resolver("MELEE_VIEWANIM_ATK"), "2");
  });
});

describe("una constante que vale un getter se EVALÚA al usarla (script.cpp:5653 y :5742-5744)", () => {
  const TEXTO = "{\n\tconst ANIM_ATTACK1 14\n\tconst ANIM_ATTACK2 15\n\tconst MELEE_VIEWANIM_ATK $rand(ANIM_ATTACK1,ANIM_ATTACK2)\n}\n" +
    `${ATAQUE}{ melee_start\n\tlocal L_ANIM MELEE_VIEWANIM_ATK\n\tplayviewanim L_ANIM\n}\n`;

  test("`smallarms_base`: el dado se tira con los dos extremos resueltos, y salen sus DOS caras", () => {
    const v = vistaDeRetorno(guionDe(TEXTO), "melee");
    assert.deepEqual(v.dado, [14, 15]);
    assert.deepEqual(v.secuencias, [14, 15], "sin evaluar, el TEXTO «$rand(…)» con `atoi` es 0");
    assert.equal(v.sinResolver, false);
  });
});

describe("los dos lados y el reloj (genericitem.cpp:2017; scriptcmds.cpp:6842)", () => {
  test("`playviewanim` detrás de `if game.serverside` NO se ve: en el servidor no hace nada", () => {
    const g = guionDe(`${ATAQUE}{ melee_start\n\tif game.serverside\n\tplayviewanim 5\n}\n`);
    assert.deepEqual(vistaDeRetorno(g, "melee").secuencias, []);
  });

  test("`splayviewanim` es del servidor y llega DESPUÉS del `playviewanim` del cliente: gana", () => {
    const g = guionDe(`${ATAQUE}{ melee_start\n\tplayviewanim 5\n\tif game.serverside\n\tsplayviewanim ent_me 6\n}\n`);
    const v = vistaDeRetorno(g, "melee");
    assert.deepEqual(v.secuencias, [6]);
    assert.equal(v.por, "splayviewanim");
  });

  test("corren TODOS los eventos que se llaman igual, y queda el último (`CallScriptEvent`)", () => {
    const g = guionDe(`${ATAQUE}{ melee_start\n\tplayviewanim 5\n}\n{ melee_start\n\tplayviewanim 9\n}\n`);
    assert.deepEqual(vistaDeRetorno(g, "melee").secuencias, [9]);
  });

  test("lo que se programa para después sale con su hora, y sólo mientras dura el ataque", () => {
    const g = guionDe(`${ATAQUE}{ melee_start\n\tcallevent 0.9 luego\n\tcallevent 3.0 tarde\n}\n{ luego\n\tif game.item.attacking\n\tplayviewanim 4\n}\n{ tarde\n\tplayviewanim 8\n}\n`);
    const v = vistaDeRetorno(g, "melee", 2.0);
    assert.deepEqual(v.secuencias, []);
    assert.deepEqual(v.tardias.map((x) => [x.t, x.indice]), [[0.9, 4]]);
  });

  test("un evento que no existe no pone nada, y se dice", () => {
    const v = vistaDeRetorno(guionDe(ATAQUE), "melee");
    assert.equal(v.existe, false);
    assert.deepEqual(v.secuencias, []);
  });
});

// ── 2. LA REGLA, sobre los guiones del juego ───────────────────────────────

describe("lo que pone el `<retorno>_start` de cada ataque (giattack.cpp:345)", { skip: sinScripts }, () => {
  const de = (id) => {
    const f = leerFichaObjeto(SCRIPTS, `items/${id}`);
    const v = vistaDeArma(`items/${id}`, f.ataques, SCRIPTS);
    return f.ataques.map((a, i) => ({ retorno: a.retorno, carga: a.carga, ...v.vistas[i] }));
  };

  test("la Blood Drinker: normal 2, primera barra 3 (ANIM_LUNGE), y la segunda barra QUITA el modelo", () => {
    const [normal, uno, dos] = de("swords_blood_drinker");
    // swords_blood_drinker.script:16 `ANIM_ATTACK1 2`, :56 `MELEE_VIEWANIM_ATK ANIM_ATTACK1`.
    assert.equal(normal.retorno, "melee");
    assert.deepEqual(normal.secuencias, [2]);
    // :20 `ANIM_LUNGE 3`, :185-187 `special_01_start` -> `playviewanim ANIM_LUNGE`.
    assert.equal(uno.retorno, "special_01");
    assert.equal(uno.carga, 1);
    assert.deepEqual(uno.secuencias, [3]);
    // :146-150 `throwsword_start`: `setviewmodel none` y DESPUÉS `playviewanim
    // 4`. Esa 4 cae sobre ningún modelo: no es una secuencia del arma.
    assert.equal(dos.retorno, "throwsword");
    assert.equal(dos.carga, 2.5);
    assert.deepEqual(dos.secuencias, []);
    assert.equal(dos.sinModelo, true);
    assert.equal(normal.sinModelo, false);
    assert.equal(uno.sinModelo, false);
  });

  test("el bastón: estocada 4 (VANIM_POKE1), cargada 5 (VANIM_POKE2), y las pone el SERVIDOR", () => {
    const [normal, uno] = de("polearms_qs");
    // polearms_base.script:36-37, :480 y :486, y el `splayviewanim` de :531.
    assert.equal(normal.retorno, "attack_poke1");
    assert.deepEqual(normal.secuencias, [4]);
    assert.equal(normal.por, "splayviewanim");
    assert.equal(uno.retorno, "attack_poke2");
    assert.deepEqual(uno.secuencias, [5]);
  });

  test("la espada oxidada sortea entre sus tres, una por cara (swords_base_onehanded.script:26-35)", () => {
    const [normal, uno] = de("swords_rsword");
    assert.deepEqual(normal.secuencias, [2, 3, 4]);
    assert.deepEqual(normal.dado, [1, 3]);
    // Y su cargado llama a `melee_start` (base_melee.script:147-153): el mismo sorteo.
    assert.deepEqual(uno.secuencias, [2, 3, 4]);
  });

  test("la maza NO sortea: siempre la 2; y su mazazo no pone nada al soltar y la 2 a los 0,9 s", () => {
    const [normal, uno, dos] = de("blunt_mace");
    // blunt_base_onehanded.script:8 y :12; base_melee.script:137.
    assert.deepEqual(normal.secuencias, [2]);
    assert.deepEqual(uno.secuencias, [2]);
    // :83-91: `special_02_start` -> `callevent 0.9 bash` -> `playviewanim MELEE_VIEWANIM_ATK`.
    assert.equal(dos.retorno, "special_02");
    assert.deepEqual(dos.secuencias, []);
    assert.deepEqual(dos.tardias.map((x) => [x.t, x.indice]), [[0.9, 2]]);
  });

  test("la daga: la constante es un dado y salen sus dos caras (smallarms_base.script:18, smallarms_dagger.script:14-15)", () => {
    const [normal] = de("smallarms_dagger");
    assert.deepEqual(normal.secuencias, [23, 24]);
  });

  test("el reposo del bastón es la 0 y el de la Blood Drinker la 1: el segundo juego de nombres (polearms_base.script:32 y :35)", () => {
    const qs = leerFichaObjeto(SCRIPTS, "items/polearms_qs").animaciones;
    assert.equal(qs.parado, 0, "VANIM_IDLE1; sin leerlo salía `null` y quien empuña ponía la 1 por omisión");
    assert.equal(qs.sacar, 3, "VANIM_DRAW");
    assert.equal(leerFichaObjeto(SCRIPTS, "items/swords_blood_drinker").animaciones.parado, 1, "ANIM_IDLE1 (swords_blood_drinker.script:14)");
  });

  test("una secuencia puesta tras `setviewmodel <otro>` es del OTRO modelo: el hacha arrojadiza no se la cuelga al arma", () => {
    const tiro = de("axes_td").find((a) => a.retorno === "axethrow");
    assert.deepEqual(tiro.secuencias, []);
    assert.equal(tiro.otroModelo.length, 1);
    assert.equal(tiro.sinModelo, false);
  });

  test("la patada cambia el modelo de vista entero: se dice y no se cuela como secuencia del arma (base_kick.script:39-52)", () => {
    const patada = de("fist_bare").find((a) => a.retorno === "kickatk");
    assert.deepEqual(patada.secuencias, []);
    assert.deepEqual(patada.tardias, []);
    assert.equal(patada.otroModelo.length, 1);
  });
});

// ── 3. EL BRAZO, con la ficha horneada ─────────────────────────────────────

/** Un jugador: aprieta y suelta por `tic`, y apunta lo que el brazo devuelve. */
function partida(id, { azar = () => 0.999 } = {}) {
  const brazo = new Brazo(armaDe(id), { azar });
  const ev = { empiezan: [], tardias: [], acaban: 0, t: 0 };
  const paso = (pulsado) => {
    const e = brazo.tic(DT, { pulsado, destreza: 100, mana: 100000 });
    ev.t += DT;
    if (e.empieza) ev.empiezan.push({ retorno: e.empieza.retorno, carga: e.empieza.carga ?? 0, animacion: e.animacion, sinModelo: Boolean(e.sinModelo), t: ev.t });
    if (e.animacionTardia !== undefined) ev.tardias.push({ indice: e.animacionTardia, t: ev.t });
    if (e.acaba) ev.acaban++;
    return e;
  };
  return { brazo, ev, paso };
}

/** Clic, segundo clic durante el mandoble aguantando `segundos`, y soltar (genericitem.cpp:735-741). */
function cargarYSoltar(p, segundos, despues = 4) {
  p.paso(true);
  for (let k = 0; k < 6; k++) p.paso(false);
  for (let t = 0; t < segundos; t += DT) p.paso(true);
  for (let t = 0; t < despues; t += DT) p.paso(false);
}

describe("`Brazo`: la secuencia es del ATAQUE, no del arma", { skip: sinArmas }, () => {
  test("Blood Drinker: el mandoble pone la 2 y la primera barra la 3", () => {
    const p = partida("swords_blood_drinker");
    cargarYSoltar(p, 1.2);
    assert.deepEqual(p.ev.empiezan.map((e) => [e.retorno, e.animacion]), [["melee", 2], ["special_01", 3]]);
  });

  test("Blood Drinker: la segunda barra es el lanzamiento y quita el modelo", () => {
    const p = partida("swords_blood_drinker");
    cargarYSoltar(p, 2.6);
    const lanzado = p.ev.empiezan.at(-1);
    assert.equal(lanzado.retorno, "throwsword");
    assert.equal(lanzado.animacion, null);
    assert.equal(lanzado.sinModelo, true);
    assert.equal(p.ev.empiezan[0].sinModelo, false, "el mandoble del primer clic no lo quita");
  });

  test("el bastón (el SEGUNDO caso): estocada 4 y cargada 5 — antes no ponía ninguna", () => {
    const p = partida("polearms_qs");
    cargarYSoltar(p, 1.2);
    assert.deepEqual(p.ev.empiezan.map((e) => [e.retorno, e.animacion]), [["attack_poke1", 4], ["attack_poke2", 5]]);
  });

  test("la maza no sortea: con el dado en cualquier cara, la 2", () => {
    for (const cara of [0, 0.4, 0.999]) {
      const p = partida("blunt_mace", { azar: () => cara });
      p.paso(true);
      assert.equal(p.ev.empiezan[0].animacion, 2, `con el dado a ${cara}`);
    }
  });

  test("la espada oxidada sí: las tres caras dan la 2, la 3 y la 4", () => {
    const vistas = [0, 0.4, 0.999].map((cara) => {
      const p = partida("swords_rsword", { azar: () => cara });
      p.paso(true);
      return p.ev.empiezan[0].animacion;
    });
    assert.deepEqual(vistas, [2, 3, 4]);
  });

  test("el mazazo de la maza: al soltar NO pone secuencia, y la 2 llega a los 0,9 s de empezar", () => {
    const p = partida("blunt_mace");
    cargarYSoltar(p, 2.6);
    const mazazo = p.ev.empiezan.at(-1);
    assert.equal(mazazo.retorno, "special_02");
    assert.equal(mazazo.animacion, null, "vacía no es «la 0»: el motor deja la que hubiera");
    assert.equal(p.ev.tardias.length, 1);
    assert.equal(p.ev.tardias[0].indice, 2);
    const tras = p.ev.tardias[0].t - mazazo.t;
    // blunt_base_onehanded.script:85 `callevent 0.9 bash`.
    assert.ok(tras >= 0.9 - 1e-9 && tras < 0.9 + 2 * DT, `${tras.toFixed(3)} s`);
  });

  test("sin `vista` (un catálogo de antes), el sorteo de siempre entre `ANIM_ATTACK`", () => {
    const vieja = structuredClone(armaDe("swords_blood_drinker"));
    for (const a of vieja.ataques) delete a.vista;
    vieja.animaciones.ataque = [7, 8, 9];
    const b = new Brazo(vieja, { azar: () => 0.999 });
    const e = b.tic(DT, { pulsado: true, destreza: 100, mana: 0 });
    assert.equal(e.animacion, 9);
  });
});

// ── 4. EL HORNEADO ─────────────────────────────────────────────────────────

describe("build/msr/armas.json trae la vista de cada ataque", { skip: sinArmas }, () => {
  test("y el modelo de la mano trae horneadas las secuencias que piden sus ataques", () => {
    const faltan = [];
    for (const a of cat.armas) {
      if (!a.enMano?.clave) continue;
      const hay = new Set((a.enMano.detalleSecuencias ?? []).map((s) => s.indice));
      const tope = a.enMano.secuenciasEnElArchivo ?? Infinity;
      for (const x of a.ataques) {
        for (const i of [...(x.vista?.secuencias ?? []), ...(x.vista?.tardias ?? []).map((y) => y.indice)]) {
          if (i < tope && !hay.has(i)) faltan.push(`${a.id}/${x.retorno}: ${i}`);
        }
      }
    }
    assert.deepEqual(faltan, []);
  });

  test("la 3 de la Blood Drinker y la 5 del bastón están en SU carpeta", () => {
    const indices = (id) => armaDe(id).enMano.detalleSecuencias.map((s) => s.indice);
    assert.ok(indices("swords_blood_drinker").includes(3));
    assert.ok(indices("polearms_qs").includes(5));
  });

  test("ninguna vista sin resolver, y las cuentas del resumen salen de los ataques", () => {
    const v = cat.resumen.vistas;
    assert.deepEqual(v.sinResolver, []);
    const con = cat.armas.flatMap((a) => a.ataques).filter((x) => x.vista);
    assert.equal(v.ataques, con.length);
    assert.equal(v.conSecuencia + v.soloDespues + v.noTocan, v.ataques);
  });

  test("el bastón descansa en la 0 (VANIM_IDLE1, polearms_base.script:32), no en la 1 por omisión", () => {
    assert.equal(armaDe("polearms_qs").animaciones.parado, 0);
    assert.equal(armaDe("polearms_qs").animaciones.sacar, 3);
  });
});
