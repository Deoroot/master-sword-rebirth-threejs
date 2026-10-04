// EL 100 — EL MANÁ DE LOS ATAQUES, LA DESTREZA QUE PIDEN, EL MODELO DE LO QUE
// VUELA Y LA BOLA DEL ORION BOW (doc/ARMAS_100.md).
//
// Por donde entra el juego, la regla del 59 de CLAUDE.md:
//
//   - el LECTOR se prueba dándole TEXTO (guiones en una carpeta temporal) y los
//     guiones del juego, nunca un objeto de ataque escrito a mano (el 67);
//   - el maná, la destreza y la bola se prueban con un `Brazo` de verdad sobre
//     la ficha HORNEADA (`build/msr/armas.json`), con `tic` paso a paso y el
//     maná del personaje bajando con lo que `tic` devuelve, como `pasoDelBrazo`;
//   - el modelo de lo que vuela, con `montarArco` de verdad: `tirar` y
//     `tirarBola` cogen la pieza ellos, y la prueba sólo mira de QUÉ conjunto.

import test, { describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { leerFichaObjeto, hacerCuentas, condicionDeCuenta } from "../src/bsp/script.js";
import { Brazo } from "../src/play/golpe.js";
import { montarArco } from "../src/juego/arco.js";
import { ORION, BOLA_DE_MANA, CargaDeOrion, radioDeLaBola } from "../src/play/orion.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const sinScripts = !existsSync(`${SCRIPTS}/items/bows_orion1.script`) && "sin ../MSC/MSCScripts";
const RAIZ_REPO = fileURLToPath(new URL("..", import.meta.url));
const ARMAS = join(RAIZ_REPO, "build/msr/armas.json");
const cat = existsSync(ARMAS) ? JSON.parse(readFileSync(ARMAS, "utf8")) : null;
// El horneado del 100 trae `mana` en cada ataque y la lista `bolas`.
const sinArmas = !(cat?.bolas && cat.armas?.[0]?.ataques?.[0] && "mana" in cat.armas[0].ataques[0])
  && "sin build/msr/armas.json del 100 (npm run armas)";
const armaDe = (id) => cat.armas.find((a) => a.id === id);
const DT = 1 / 60;

// ── Una carpeta `items/` de mentira ────────────────────────────────────────
const RAIZ = mkdtempSync(join(tmpdir(), "armas100-"));
mkdirSync(join(RAIZ, "items"));
after(() => rmSync(RAIZ, { recursive: true, force: true }));
let n = 0;
function ficha(guiones) {
  const pre = `t${n++}_`;
  const nombres = Object.keys(guiones);
  for (const [nombre, texto] of Object.entries(guiones)) {
    writeFileSync(join(RAIZ, "items", `${pre}${nombre}.script`), texto.replaceAll("#include items/", `#include items/${pre}`), "latin1");
  }
  return leerFichaObjeto(RAIZ, `items/${pre}${nombres[0]}`);
}
const evento = (cuerpo) => `{ game_spawn\n\tlocal reg.attack.type strike-land\n\tlocal reg.attack.keys -attack1\n${cuerpo}\tregisterattack\n}\n`;

// ── 1. LAS CUENTAS DEL LECTOR ───────────────────────────────────────────────

describe("las cuentas sobre `reg.attack.*` (scriptcmds.cpp:4200-4229)", () => {
  test("`add reg.attack.reqskill 4` tras el `local`: la lanza pide BASE + 4", () => {
    const f = ficha({ a: `{\n\tconst BASE_LEVEL_REQ 35\n}\n${evento("\tlocal reg.attack.reqskill BASE_LEVEL_REQ\n\tadd reg.attack.reqskill 4\n")}` });
    assert.equal(f.ataques[0].pideHabilidad, 39);
  });

  test("el `if ( BASE_LEVEL_REQ > reg.attack.reqskill )` de los mandobles: 2 + 30 = 32, y con BASE 1 se queda en 2", () => {
    const linea = "\tlocal reg.attack.reqskill 2\n\tif ( BASE_LEVEL_REQ > reg.attack.reqskill ) add reg.attack.reqskill BASE_LEVEL_REQ\n";
    assert.equal(ficha({ a: `{\n\tconst BASE_LEVEL_REQ 30\n}\n${evento(linea)}` }).ataques[0].pideHabilidad, 32);
    // CONTROL: la condición falsa NO suma (si el lector ignorara el `if`, 3).
    assert.equal(ficha({ a: `{\n\tconst BASE_LEVEL_REQ 1\n}\n${evento(linea)}` }).ataques[0].pideHabilidad, 2);
    // Y sin la constante: vale su nombre, `GetNumeric` 0, y 0 > 2 es falso.
    assert.equal(ficha({ a: evento(linea) }).ataques[0].pideHabilidad, 2);
  });

  test("la constante del ARMA vale aunque se declare DESPUÉS del `#include` de la base (en el motor ya existe al correr)", () => {
    const f = ficha({
      arma: `#include items/base\n{\n\tconst BASE_LEVEL_REQ 20\n}\n`,
      base: evento("\tlocal reg.attack.reqskill BASE_LEVEL_REQ\n\tadd reg.attack.reqskill 2\n"),
    });
    assert.equal(f.ataques[0].pideHabilidad, 22);
  });

  test("un `local` DESPUÉS de un `add` vuelve a empezar", () => {
    const f = ficha({ a: evento("\tlocal reg.attack.reqskill 10\n\tadd reg.attack.reqskill 5\n\tlocal reg.attack.reqskill 3\n") });
    assert.equal(f.ataques[0].pideHabilidad, 3);
  });

  test("`mpdrain`: el número, la constante, y sin poner 0 (`atof` de su nombre, giattack.cpp:496)", () => {
    assert.equal(ficha({ a: evento("\tlocal reg.attack.mpdrain 75\n") }).ataques[0].mana, 75);
    assert.equal(ficha({ a: `{\n\tconst RANGED_MP 30\n}\n${evento("\tlocal reg.attack.mpdrain RANGED_MP\n")}` }).ataques[0].mana, 30);
    assert.equal(ficha({ a: evento("") }).ataques[0].mana, 0);
    // Una constante que nadie declara (`SHIELD_MP` de la Felewyn Shard): 0.
    assert.equal(ficha({ a: evento("\tlocal reg.attack.mpdrain SHIELD_MP\n") }).ataques[0].mana, 0);
  });

  test("`if ( SPECIAL_02_MP isnot 'SPECIAL_02_MP' ) local reg.attack.mpdrain SPECIAL_02_MP` (blunt_base_onehanded.script:74)", () => {
    const linea = "\tif ( SPECIAL_02_MP isnot 'SPECIAL_02_MP' ) local reg.attack.mpdrain SPECIAL_02_MP\n";
    assert.equal(ficha({ a: `{\n\tconst SPECIAL_02_MP 30\n}\n${evento(linea)}` }).ataques[0].mana, 30);
    // Sin la constante, `GetVar` le quita las comillas al literal (script.cpp:
    // 4406-4409) y los dos lados son «SPECIAL_02_MP»: falso, y no se pone.
    const sin = ficha({ a: evento(linea) }).ataques[0];
    assert.equal(sin.mana, 0);
    // En la ficha las dos lecturas dan 0; lo que las distingue es si el `local`
    // llega a correr. `hacerCuentas` es la que usa el lector:
    const op = { op: "local", campo: "mpdrain", valor: "SPECIAL_02_MP", cond: "SPECIAL_02_MP isnot 'SPECIAL_02_MP'" };
    assert.equal(hacerCuentas(new Map([["#cuentas", [op]]]), new Map()).valores.has("mpdrain"), false);
    assert.equal(hacerCuentas(new Map([["#cuentas", [op]]]), new Map([["SPECIAL_02_MP", "30"]])).valores.get("mpdrain"), "30");
  });

  test("las cuentas de `dmg`, `range`… se APUNTAN y no se aplican (el daño cargado lo multiplica `Brazo`)", () => {
    const f = ficha({ a: evento("\tlocal reg.attack.dmg 10\n\tmultiply reg.attack.dmg 2\n\tmultiply reg.attack.range 1.5\n") });
    assert.equal(f.ataques[0].dano, 10);
    assert.deepEqual(f.ataques[0].cuentasSinAplicar, ["multiply dmg 2", "multiply range 1.5"]);
  });

  test("`condicionDeCuenta` y `hacerCuentas`: lo que no es una comparación simple, no se decide", () => {
    assert.equal(condicionDeCuenta("$get(ent_owner,mp) > 3", () => "x"), false);   // comparación de texto/número
    assert.equal(condicionDeCuenta("ALGO", () => "1"), null);
    const r = hacerCuentas(new Map([["#cuentas", [{ op: "add", campo: "reqskill", valor: "4", cond: "A B" }]]]), new Map());
    assert.deepEqual(r.dudosas, ["if ( A B ) add reqskill"]);
  });
});

describe("los guiones del juego", { skip: sinScripts }, () => {
  const de = (id) => leerFichaObjeto(SCRIPTS, `items/${id}`);
  test("Shadow Lance: el tiro pide 39 y cuesta 10; el `poke2` 37; la ráfaga 100 de maná", () => {
    const f = de("polearms_sl");
    const tiro = f.ataques.find((a) => a.tipo === "charge-throw-projectile");
    assert.equal(tiro.pideHabilidad, 39);
    assert.equal(tiro.mana, 10);
    assert.ok(f.ataques.some((a) => a.carga === 1 && a.pideHabilidad === 37));
    assert.ok(f.ataques.some((a) => a.mana === 100));
  });
  test("Unholy Blade: el golpe cargado pide 32 (no 2) y la sombra cuesta 30", () => {
    const f = de("swords_ub");
    assert.equal(f.ataques.find((a) => a.carga === 1).pideHabilidad, 32);
    assert.equal(f.ataques.find((a) => a.tipo === "charge-throw-projectile").mana, 30);
  });
  test("Ice Staff: su especial de serie cuesta los 30 de `SPECIAL_02_MP`", () => {
    assert.ok(de("blunt_staff_i").ataques.some((a) => a.mana === 30));
  });
});

// ── 2. EL MANÁ, POR `Brazo` ────────────────────────────────────────────────

/** Lo que hace `pasoDelBrazo` con el maná, y nada más. */
function jugar(id, { mana = 100, destreza = 60 } = {}) {
  const brazo = new Brazo(armaDe(id));
  const ev = { mana, empiezan: [], sinMana: [], tiros: [], golpes: [], mensajes: [], bolas: [], gastado: 0 };
  const paso = (pulsado) => {
    const e = brazo.tic(DT, { pulsado, destreza, mana: ev.mana });
    if (e.gastaMana > 0) { ev.mana = Math.max(0, ev.mana - e.gastaMana); ev.gastado += e.gastaMana; }
    if (e.empieza) ev.empiezan.push(e.empieza);
    if (e.sinMana) ev.sinMana.push(e.sinMana);
    if (e.tira) ev.tiros.push(e.tira);
    if (e.golpe) ev.golpes.push(e.golpe);
    if (e.bola) ev.bolas.push(e.bola);
    for (const m of e.mensajes ?? []) ev.mensajes.push(m);
    return e;
  };
  return { brazo, ev, paso };
}
/** El cargado como un jugador: clic, segundo clic aguantando `s`, soltar y esperar `luego`. */
function cargarYSoltar(p, s, luego = 2) {
  p.paso(true);
  for (let k = 0; k < 6; k++) p.paso(false);
  for (let t = 0; t < s; t += DT) p.paso(true);
  for (let t = 0; t < luego; t += DT) p.paso(false);
}

describe("el maná se cobra al EMPEZAR (giattack.cpp:392, :897-908, :1051-1053)", { skip: sinArmas }, () => {
  test("la sombra del Unholy Blade: con 100 sale y quedan 70", () => {
    const p = jugar("swords_ub", { mana: 100 });
    cargarYSoltar(p, 2.6);
    assert.equal(p.ev.tiros.length, 1);
    assert.equal(p.ev.tiros[0].proyectil, "proj_ub");
    assert.equal(p.ev.mana, 70);
  });

  test("con 29 no sale, el maná no se toca y el ataque cuenta como empezado-y-cancelado (`sinMana`)", () => {
    const p = jugar("swords_ub", { mana: 29 });
    cargarYSoltar(p, 2.6);
    assert.equal(p.ev.tiros.length, 0);
    assert.equal(p.ev.mana, 29);
    assert.equal(p.ev.sinMana.length, 1);
    assert.equal(p.ev.sinMana[0].tipo, "charge-throw-projectile");
  });

  test("`BlockButton`: sin maná, aguantar el botón NO reintenta; al soltar y volver a pulsar sí", () => {
    // El Dark Sword cobra 5 en su primer cargado; el mandoble normal no cuesta.
    // Con la Shadow Lance la RÁFAGA (carga 4) cuesta 100: con 50 se cancela.
    const p = jugar("polearms_sl", { mana: 50 });
    p.paso(true);
    for (let k = 0; k < 6; k++) p.paso(false);
    for (let t = 0; t < 4.2; t += DT) p.paso(true);   // carga 4: la ráfaga
    p.paso(false);                                    // suelta: elige la ráfaga, sin maná
    const cancelados = p.ev.sinMana.length;
    assert.ok(cancelados >= 1, "la ráfaga se cancela");
    assert.ok(p.brazo.bloqueado, "el botón queda bloqueado");
    for (let t = 0; t < 1; t += DT) p.paso(true);     // aguantar: leído como ARRIBA
    assert.equal(p.ev.empiezan.length, 1, "sólo el primer mandoble: nada empieza con el botón bloqueado");
    p.paso(false);
    assert.equal(p.brazo.bloqueado, false);
    for (let t = 0; t < 0.2; t += DT) p.paso(true);
    assert.ok(p.ev.empiezan.length >= 2, "soltado, vuelve a atacar");
  });

  test("CONTROL: un ataque sin `mpdrain` no mira el maná — con 0 el mandoble sale", () => {
    const p = jugar("swords_ub", { mana: 0 });
    for (let t = 0; t < 0.2; t += DT) p.paso(true);
    assert.equal(p.ev.empiezan.length, 1);
    assert.equal(p.ev.sinMana.length, 0);
    assert.equal(p.ev.gastado, 0);
  });

  test("los 18 ataques de 11 armas con `mpdrain` en el horneado, calculado", () => {
    const con = cat.armas.flatMap((a) => a.ataques.filter((x) => x.mana > 0).map(() => a.id));
    assert.equal(con.length, 18);
    assert.equal(new Set(con).size, 11);
  });
});

describe("`reqskill` con sus cuentas, por `Brazo` (giattack.cpp:312-317)", { skip: sinArmas }, () => {
  test("Shadow Lance con astas 36: antes tiraba (pedía 35), ahora no; con 39 sí", () => {
    const corto = jugar("polearms_sl", { mana: 500, destreza: 36 });
    cargarYSoltar(corto, 2.6);
    assert.equal(corto.ev.tiros.length, 0);
    const justo = jugar("polearms_sl", { mana: 500, destreza: 39 });
    cargarYSoltar(justo, 2.6);
    assert.equal(justo.ev.tiros.length, 1);
  });
});

// ── 3. EL ORION BOW, POR `Brazo` ─────────────────────────────────────────────

describe("el Orion Bow y su bola (bows_orion1.script:81-193)", { skip: sinArmas }, () => {
  /** Saca el arco, espera, aguanta `s` y suelta. */
  const orion = ({ mana = 100, destreza = 60, espera = 1.2, s = 1.0 } = {}) => {
    const p = jugar("bows_orion1", { mana, destreza });
    for (let t = 0; t < espera; t += DT) p.paso(false);
    for (let t = 0; t < s; t += DT) p.paso(true);
    p.paso(false);
    return p;
  };

  test("en el brazo: sin ataques del motor, con el guion de tiro, y tira proyectiles", () => {
    const b = new Brazo(armaDe("bows_orion1"));
    assert.equal(b.ataques.length, 0);
    assert.ok(b.guionDeTiro instanceof CargaDeOrion);
    assert.ok(b.tiraProyectiles);
    assert.equal(b.ataqueDeReferencia.habilidad, "archery");
  });

  test("aguantar 1 s: la bola sale con su tamaño, 10 de daño por tamaño, y cuesta 4 por tamaño", () => {
    const p = orion({ s: 1.0 });
    assert.equal(p.ev.bolas.length, 1);
    const b = p.ev.bolas[0];
    // Cargas a 0, 0,3, 0,6 y 0,9 s: cuatro.
    assert.equal(b.tamano, 4);
    assert.equal(b.dano, 40);
    assert.equal(p.ev.gastado, 4 * ORION.costeDeCarga);
    assert.equal(p.ev.mana, 100 - 16);
  });

  test("aguantar 5 s: el tope es 10, 40 de maná y el aviso UNA vez", () => {
    const p = orion({ s: 5 });
    assert.deepEqual(p.ev.bolas, [{ tamano: 10, dano: 100 }]);
    assert.equal(p.ev.gastado, 40);
    assert.equal(p.ev.mensajes.filter((m) => m.texto === ORION.frases.tope).length, 1);
  });

  test("con 10 de maná: dos cargas cobradas, la tercera CRECE sin cobrar con el daño de antes (:123-150)", () => {
    // Cargas a 0 y 0,3 s (cobran 4 + 4); a 0,6 s quedan 2 ≤ 4: crece a 3 sin
    // cobrar y `BALL_DMG` se queda en el 20 calculado ANTES del `add` (:123-124).
    const corto = orion({ mana: 10, s: 0.7 });
    assert.deepEqual(corto.ev.bolas, [{ tamano: 3, dano: 20 }]);
    assert.equal(corto.ev.gastado, 8);
    assert.ok(corto.ev.mensajes.some((m) => m.texto === ORION.frases.sinMana));
    // Y aguantando más, la vuelta siguiente rehace `BALL_DMG = BALL_SIZE × 10`
    // ANTES del `if !MAX_LEVEL` que corta (:123-126): 30. Del guion, no nuestro.
    assert.deepEqual(orion({ mana: 10, s: 3 }).ev.bolas, [{ tamano: 3, dano: 30 }]);
  });

  test("sin la competencia (arquería 10 < 15): una carga de 4 y 0,05… sólo si se suelta antes de la vuelta siguiente (:123-126, :167-171)", () => {
    const corto = orion({ destreza: 10, s: 0.2 });
    assert.deepEqual(corto.ev.bolas, [{ tamano: 1, dano: 0.05 }]);
    assert.equal(corto.ev.gastado, 4);
    // Aguantando, la vuelta de los 0,3 s pone otra vez tamaño × 10 y corta:
    // el castigo de 0,05 se pierde. Así está escrito.
    const largo = orion({ destreza: 10, s: 3 });
    assert.deepEqual(largo.ev.bolas, [{ tamano: 1, dano: 10 }]);
    assert.equal(largo.ev.gastado, 4);
  });

  test("con 4 de maná no empieza (`> MP_DRAIN`, :88) y al soltar no sale nada", () => {
    const p = orion({ mana: 4, s: 1 });
    assert.equal(p.ev.bolas.length, 0);
    assert.equal(p.ev.gastado, 0);
    assert.ok(p.ev.mensajes.some((m) => m.texto === ORION.frases.sinManaAlEmpezar));
  });

  test("el primer segundo tras sacarlo no carga (`game_deploy`, :76-79)", () => {
    const p = orion({ espera: 0, s: 0.9 });
    assert.equal(p.ev.bolas.length, 0);
    assert.equal(p.ev.gastado, 0);
  });

  test("CONTROL: un arco normal no tiene guion de tiro", () => {
    assert.equal(new Brazo(armaDe("bows_treebow")).guionDeTiro, null);
  });

  test("el radio del área: 24 × tamaño entre 55 y 140 (proj_mana2.script:104-111)", () => {
    assert.equal(radioDeLaBola(1), 55);
    assert.equal(radioDeLaBola(3), 72);
    assert.equal(radioDeLaBola(10), 140);
  });
});

// ── 4. EL MODELO DE LO QUE VUELA, Y LA BOLA EN EL AIRE, POR `montarArco` ───

class Rayo { constructor(o, d) { this.o = o; this.d = d; } }
const sinChoques = { castRay: () => null };
const habilidades = (n) => ({
  ...Object.fromEntries(["archery", "swordsmanship", "polearms"].map((h) =>
    [h, { proficiency: { valor: n }, balance: { valor: n }, power: { valor: n } }])),
  spellcasting: { affliction: { valor: n } },
});

/** Un conjunto de mentira que dice de dónde salen sus piezas. */
function conjunto(clave) {
  const piezas = [];
  return {
    clave, cuantas: 4,
    get puestas() { return piezas.filter((p) => !p.libre).length; },
    coger() { const p = { de: clave, libre: false, escala: 1 }; piezas.push(p); return p; },
    soltar(p) { if (p) p.libre = true; },
    apuntar() {},
    escalar(p, s) { p.escala = s; },
  };
}

function arcoDe(id, { bichos = [] } = {}) {
  const brazo = new Brazo(armaDe(id));
  const heridos = [];
  const a = montarArco({
    RAPIER: { Ray: Rayo }, world: () => sinChoques,
    player: () => ({ pitch: 0, yaw: 0, eye: [0, 1.6, 0], feet: [0, 0, 0], body: {} }),
    U: () => 39.37,
    sesion: () => ({ personaje: { habilidades: habilidades(60), objetos: [] } }),
    bichos: () => ({ herir: (i, dano) => { heridos.push({ i, dano }); return { muerto: false }; } }),
    bichosSolidos: () => ({ puestos: [] }),
    brazo: () => brazo,
    catalogoDeFlechas: () => new Map(cat.flechas.map((f) => [f.id, f])),
    catalogoDeBolas: () => new Map(cat.bolas.map((b) => [b.id, b])),
    candidatosVivos: () => bichos,
    potenciaDe: () => 50, destrezaDe: () => 60,
  });
  for (const c of a.clavesQueTira(brazo)) a.ponerConjunto(c, conjunto(c));
  return { a, brazo, heridos };
}

describe("cada proyectil con SU modelo (el 100)", { skip: sinArmas }, () => {
  test("la sombra del Unholy Blade sale del conjunto de `proj_ub`, no del de la flecha", () => {
    const { a, brazo } = arcoDe("swords_ub");
    const claveSombra = cat.flechas.find((f) => f.id === "proj_ub").clave;
    assert.ok(a.clavesQueTira(brazo).includes(claveSombra));
    // CONTROL: el de la flecha de madera también está montado, para que elegir
    // el equivocado fuera posible.
    a.ponerConjunto("weapons_bows_arrows", conjunto("weapons_bows_arrows"));
    a.tirar(brazo.ataques.find((x) => x.tipo === "charge-throw-projectile"), 1);
    assert.equal(a.flechasEnVuelo.at(-1).pieza.de, claveSombra);
    assert.notEqual(claveSombra, "weapons_bows_arrows");
  });

  test("CONTROL POSITIVO: el arco de partida sí tira con la flecha de madera", () => {
    const { a, brazo } = arcoDe("bows_treebow");
    a.tirar(brazo.ataques[0], 1.3);
    assert.equal(a.flechasEnVuelo.at(-1).pieza.de, "weapons_bows_arrows");
  });

  test("sin conjunto para su modelo vuela SIN pieza y se cuenta; no se presta otro", () => {
    const { a, brazo } = arcoDe("polearms_sl");
    const sl = cat.flechas.find((f) => f.id === "proj_pole_sl").clave;
    // Un arco nuevo sin ponerle el conjunto de la lanza:
    const b2 = new Brazo(armaDe("polearms_sl"));
    const solo = montarArco({
      RAPIER: { Ray: Rayo }, world: () => sinChoques,
      player: () => ({ pitch: 0, yaw: 0, eye: [0, 1.6, 0], feet: [0, 0, 0], body: {} }), U: () => 39.37,
      sesion: () => ({ personaje: { habilidades: habilidades(60), objetos: [] } }),
      brazo: () => b2, catalogoDeFlechas: () => new Map(cat.flechas.map((f) => [f.id, f])),
    });
    solo.ponerConjunto("weapons_bows_arrows", conjunto("weapons_bows_arrows"));
    solo.tirar(b2.ataques.find((x) => x.tipo === "charge-throw-projectile"), 1);
    assert.equal(solo.flechasEnVuelo.at(-1).pieza, null);
    assert.equal(solo.deGuion.sinPieza, 1);
    assert.ok(a.clavesQueTira(brazo).includes(sl));
  });

  test("la bola del Orion Bow: su conjunto (`aura_01`, submodelo 13), a 200 u/s, sin gravedad, escala 0,75 × tamaño", () => {
    const { a, brazo } = arcoDe("bows_orion1");
    const bola = cat.bolas.find((b) => b.id === BOLA_DE_MANA.id);
    assert.equal(bola.pieza, "aura_01");
    assert.deepEqual(a.clavesQueTira(brazo), [bola.clave]);
    const f = a.tirarBola({ tamano: 4, dano: 40 });
    const e = a.flechasEnVuelo.at(-1);
    assert.equal(e.pieza.de, bola.clave);
    assert.equal(e.pieza.escala, 3);
    assert.equal(f.velocidadInicial, 200);
    assert.equal(f.gravedad, 0);
  });

  test("la bola en el aire: área cada 0,3 s, cada bicho tocado le quita un tamaño, a cero se va", () => {
    // Un bicho a 90 u delante (−z), en la línea de vuelo: a los 0,3 s la bola
    // está a 60 u (30 del bicho) y a los 0,6 s a 120 (otra vez 30). Radio 55.
    const U = 39.37;
    const bicho = { id: { ficha: { nombre: "Rata" }, muerto: false }, centro: [0, 1.6 * U, -90] };
    const { a, heridos } = arcoDe("bows_orion1", { bichos: [bicho] });
    a.tirarBola({ tamano: 2, dano: 20 });
    for (let t = 0; t < 0.31; t += DT) a.pasoDeFlechas(DT);
    assert.equal(heridos.length, 1, "un área a los 0,3 s");
    assert.equal(heridos[0].dano, 20, "caída 0: el daño entero");
    assert.equal(a.flechasEnVuelo.length, 1, "le queda tamaño 1");
    for (let t = 0; t < 0.3; t += DT) a.pasoDeFlechas(DT);
    assert.equal(heridos.length, 2);
    assert.equal(a.flechasEnVuelo.length, 0, "a tamaño 0 se va");
    const b = a.deGuion.bolas[0];
    assert.deepEqual(b.golpes.map((g) => g.radio), [55, 55]);
  });

  test("CONTROL: sin bichos la bola vive sus 10 s y se va", () => {
    const { a } = arcoDe("bows_orion1");
    a.tirarBola({ tamano: 3, dano: 30 });
    for (let t = 0; t < 9.9; t += DT) a.pasoDeFlechas(DT);
    assert.equal(a.flechasEnVuelo.length, 1);
    for (let t = 0; t < 0.2; t += DT) a.pasoDeFlechas(DT);
    assert.equal(a.flechasEnVuelo.length, 0);
  });
});
