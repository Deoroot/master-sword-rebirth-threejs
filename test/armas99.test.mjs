// EL TIRO CARGADO DE UN ARMA CUERPO A CUERPO, Y LA MONEDA DEL ARCO — experimento 99.
//
// El 98 portó los guiones de `proj_ub`, `proj_pole_sl` y `proj_arrow_spiral`, y
// sus pruebas los disparaban llamando a `tirar(ataque, 1)` A MANO: la costura
// de la prueba le construía el argumento que el juego nunca le pasaba (el 59 de
// CLAUDE.md). Jugando no salían, por dos razones distintas:
//
//   - la Unholy Blade y las astas que lanzan son cuerpo a cuerpo, y `Brazo.tic`
//     trataba su `charge-throw-projectile` como un mandoble más: daba un `golpe`
//     de 100 u y nunca un `tira`;
//   - un arco elegía SIEMPRE su ataque 0, y en un arco de Torkalath el 0 es la
//     flecha de `base_ranged`, no la esfera.
//
// Aquí todo entra por donde entra el juego: un `Brazo` de verdad sobre la ficha
// horneada, apretando y soltando el botón paso a paso, y lo que devuelve se
// manda a `tirar` igual que `pasoDelBrazo` (src/main.js). Nadie le escribe a
// mano el ataque ni lo sostenido.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Brazo } from "../src/play/golpe.js";
import { montarArco } from "../src/juego/arco.js";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ARMAS = join(RAIZ, "build/msr/armas.json");
const sinArmas = !existsSync(ARMAS) && "sin build/msr/armas.json (npm run armas)";
const cat = sinArmas ? null : JSON.parse(readFileSync(ARMAS, "utf8"));
const armaDe = (id) => cat.armas.find((a) => a.id === id);
const DT = 1 / 60;
const U = 39.37;

// ── El mundo de mentira, el de test/armas98.test.mjs ─────────────────────
class Rayo { constructor(o, d) { this.o = o; this.d = d; } }
function mundo(paredZ) {
  return {
    castRay(r, L) {
      const { o, d } = r;
      if (d.y < -0.9) { const t = o.y / -d.y; return t <= L ? { timeOfImpact: t, collider: { handle: 99 } } : null; }
      if (!(d.z < -1e-6)) return null;
      const t = (o.z + paredZ) / -d.z;
      return t < 0 || t > L ? null : { timeOfImpact: t, collider: { handle: 98 } };
    },
  };
}
const habilidades = (n) => ({
  archery: { proficiency: { valor: n }, balance: { valor: n }, power: { valor: n } },
  polearms: { proficiency: { valor: n }, balance: { valor: n }, power: { valor: n } },
  swordsmanship: { proficiency: { valor: n }, balance: { valor: n }, power: { valor: n } },
  smallarms: { proficiency: { valor: n }, balance: { valor: n }, power: { valor: n } },
  spellcasting: { fire: { valor: n }, ice: { valor: n }, lightning: { valor: n }, divination: { valor: n }, affliction: { valor: n } },
});

/**
 * EL JUEGO DE MENTIRA: un `Brazo` de verdad y el arco de verdad, y `paso` hace
 * lo que hace `pasoDelBrazo` de main.js con lo que devuelve `tic` —`golpe` a
 * `pegar`, `tira` a `tirar` con `sostenido`, y las flechas en el aire—.
 */
function partida(id, { destreza = 60, azar = Math.random, paredZ = 40 } = {}) {
  const arma = armaDe(id);
  const brazo = new Brazo(arma, { azar });
  const flechas = new Map(cat.flechas.map((f) => [f.id, f]));
  const a = montarArco({
    RAPIER: { Ray: Rayo }, world: () => mundo(paredZ),
    player: () => ({ pitch: 0, yaw: 0, eye: [0, 1.6, 0], feet: [0, 0, 0], body: {} }),
    U: () => U,
    sesion: () => ({ personaje: { habilidades: habilidades(destreza), objetos: [] } }),
    bichos: () => ({ herir: () => ({ muerto: false }) }),
    bichosSolidos: () => ({ puestos: [] }),
    brazo: () => brazo,
    catalogoDeFlechas: () => flechas,
    potenciaDe: () => 50, destrezaDe: () => destreza,
  });
  const ev = { golpes: [], tiros: [], empiezan: [], t: 0 };
  const paso = (pulsado) => {
    const e = brazo.tic(DT, { pulsado, destreza });
    ev.t += DT;
    if (e.empieza) ev.empiezan.push({ t: ev.t, ataque: e.empieza });
    if (e.golpe) ev.golpes.push({ t: ev.t, ataque: e.golpe });
    if (e.tira) ev.tiros.push({ t: ev.t, ataque: e.tira, sostenido: e.sostenido, flecha: a.tirar(e.tira, e.sostenido ?? 0) });
    if (a.flechasEnVuelo.length) a.pasoDeFlechas(DT);
    return e;
  };
  return { brazo, a, ev, paso };
}

/**
 * EL CARGADO COMO LO HACE UN JUGADOR (genericitem.cpp:735-741): clic —mandoble—,
 * SEGUNDO clic mientras corre y aguantar `segundos`, y soltar. Devuelve el
 * instante en que se soltó.
 */
function cargarYSoltar(p, segundos) {
  p.paso(true);
  for (let k = 0; k < 6; k++) p.paso(false);
  for (let t = 0; t < segundos; t += DT) p.paso(true);
  return p.ev.t;
}

// ── 1. LAS DOS ARMAS DEL PENDIENTE ────────────────────────────────────────

test("la Unholy Blade tira su sombra JUGANDO: cargar 2 niveles, soltar, y sale `proj_ub` a 1 s + 0,1 s", { skip: sinArmas }, () => {
  const p = partida("swords_ub");
  const suelta = cargarYSoltar(p, 2.6);
  for (let t = 0; t < 3; t += DT) p.paso(false);
  const lanzado = p.ev.empiezan.find((e) => e.ataque.tipo === "charge-throw-projectile");
  assert.ok(lanzado, "el cargado de prioridad 2 se elige al soltar");
  assert.ok(Math.abs(lanzado.t - suelta - DT) < 1e-9, "al soltar, el paso siguiente");
  assert.equal(p.ev.tiros.length, 1);
  const [tiro] = p.ev.tiros;
  assert.equal(tiro.ataque.proyectil, "proj_ub");
  assert.equal(tiro.flecha?.ficha?.id, "proj_ub", "sale la sombra, no la flecha gratis");
  assert.ok(tiro.flecha.areaDeVuelo, "con su área en vuelo (la del 98)");
  // `tTrueStart + tProjMinHold` (1,0) y luego `delay.strike` (0,1) desde la suelta.
  const tras = tiro.t - lanzado.t;
  assert.ok(tras >= 1.1 - 1e-9 && tras < 1.1 + 2 * DT, `${tras.toFixed(3)} s`);
  // Y no es un mandoble: ningún `golpe` de este ataque.
  assert.equal(p.ev.golpes.filter((g) => g.ataque.tipo === "charge-throw-projectile").length, 0);
  assert.equal(p.brazo.fase, "quieto", "y acaba");
});

test("la Shadow Lance lanza `proj_pole_sl` a toda fuerza (`hold 1;1` → 700 u/s, giattack.cpp:1073-1097)", { skip: sinArmas }, () => {
  const p = partida("polearms_sl");
  cargarYSoltar(p, 2.6);
  for (let t = 0; t < 3; t += DT) p.paso(false);
  assert.equal(p.ev.tiros.length, 1);
  const [tiro] = p.ev.tiros;
  assert.equal(tiro.flecha?.ficha?.id, "proj_pole_sl");
  assert.ok(tiro.sostenido >= 1, `sostenido ${tiro.sostenido}`);
  assert.ok(Math.abs(tiro.flecha.velocidadInicial - 700) < 1e-6, `${tiro.flecha.velocidadInicial}`);
  // Y la ráfaga del 98 revienta al aterrizar en la pared.
  for (let k = 0; k < 600 && p.a.flechasEnVuelo.length; k++) p.paso(false);
  assert.equal(p.a.deGuion.areas.filter((x) => x.id === "proj_pole_sl").length, 1);
});

// ── 2. LOS CONTROLES ──────────────────────────────────────────────────────

test("CONTROL: volver a pulsar mientras espera el mínimo NO suelta — `ActivateButtonUp` sólo corre con el botón arriba", { skip: sinArmas }, () => {
  const p = partida("swords_ub");
  cargarYSoltar(p, 2.6);
  p.paso(false);   // empieza el lanzamiento
  for (let t = 0; t < 2; t += DT) p.paso(true);
  assert.equal(p.ev.tiros.length, 0, "dos segundos pulsado: nada");
  for (let t = 0; t < 0.5; t += DT) p.paso(false);
  assert.equal(p.ev.tiros.length, 1, "y al soltar, sale (el mínimo ya pasó)");
});

test("CONTROL: sin la destreza del ataque (34 en la Unholy Blade) no hay sombra y el brazo no se queda colgado", { skip: sinArmas }, () => {
  const p = partida("swords_ub", { destreza: 20 });
  cargarYSoltar(p, 2.6);
  for (let t = 0; t < 4; t += DT) p.paso(false);
  assert.equal(p.ev.tiros.length, 0);
  assert.ok(p.ev.golpes.length >= 1, "sigue dando mandobles");
  assert.equal(p.brazo.fase, "quieto");
});

test("CONTROL: cargar UN nivel da el mandoble cargado (un `golpe`), no el tiro", { skip: sinArmas }, () => {
  const p = partida("swords_ub");
  cargarYSoltar(p, 1.2);
  for (let t = 0; t < 3; t += DT) p.paso(false);
  assert.equal(p.ev.tiros.length, 0);
  assert.ok(p.ev.golpes.some((g) => g.ataque.carga === 1), "el de `chargeamt 100%`");
});

test("CONTROL: una espada sin tiro no tira nunca, cargue lo que cargue", { skip: sinArmas }, () => {
  const p = partida("swords_rsword");
  assert.equal(p.brazo.tiraProyectiles, false);
  cargarYSoltar(p, 3);
  for (let t = 0; t < 3; t += DT) p.paso(false);
  assert.equal(p.ev.tiros.length, 0);
});

// ── 3. EL SEGUNDO CASO: TODAS LAS QUE LO TIENEN ──────────────────────────

test("las ONCE armas cuerpo a cuerpo con un `charge-throw-projectile` lo tiran jugando (contado en el horneado)", { skip: sinArmas }, () => {
  // EL 99, parte R (doc/GUION_99.md): con `local` por evento los arcos con
  // `CUSTOM_ATTACK` tienen de ataque 0 el VACÍO de `bows_base` (tipo sin
  // declarar, `null`), y mirar `ataques[0]` los contaba como cuerpo a cuerpo.
  // Lo que decide `esDeTiro` es el primer ataque que `Brazo` se queda, o sea el
  // primero con tipo: eso se mira aquí.
  const ids = cat.armas
    .filter((x) => x.ataques?.find((t) => t.tipo)?.tipo !== "charge-throw-projectile"
      && x.ataques?.some((t) => t.tipo === "charge-throw-projectile"))
    .map((x) => x.id).sort();
  // El número sale del horneado; lo de abajo dice que no se ha perdido ninguna.
  assert.ok(ids.includes("swords_ub") && ids.includes("polearms_sl"));
  assert.equal(ids.length, 11, ids.join(", "));
  for (const id of ids) {
    // `azar` 0,9: la moneda cambia SIEMPRE al último empatado. El cuchillo de
    // fuego y la Frostblade empataban su tiro (prioridad 1) con su mandoble
    // cargado. CORRECCIÓN DEL 99 (parte R): el motor NO registra los dos —el
    // mandoble cargado de serie va detrás de `if !CUSTOM_REGISTER_CHARGE1`, un
    // `if` viejo que abandona el evento (script.cpp:5754-5757)—, así que con el
    // `if` viejo aplicado no hay empate; la prueba de que sale con cualquier
    // moneda está en test/guion99.test.mjs. El 0,9 se deja: no estorba.
    const p = partida(id, { destreza: 100, azar: () => 0.9 });
    assert.equal(p.brazo.tiraProyectiles, true, id);
    assert.equal(p.brazo.esDeTiro, false, id);
    const lanza = p.brazo.ataques.find((t) => t.tipo === "charge-throw-projectile");
    // Cargar justo lo que pide ese ataque y no más: con 2,5 de carga una asta
    // con ráfaga (`chargeamt 300%`) no llega a la de prioridad 3.
    cargarYSoltar(p, lanza.carga <= 1 ? 1.2 : 2.6);
    for (let t = 0; t < 3; t += DT) p.paso(false);
    assert.equal(p.ev.tiros.length, 1, `${id}: ${p.ev.tiros.length} tiros`);
    assert.equal(p.ev.tiros[0].flecha?.ficha?.id, lanza.proyectil, `${id}: ${p.ev.tiros[0].flecha?.ficha?.id}`);
  }
});

// ── 4. EL ARCO DE TORKALATH: LA MONEDA ───────────────────────────────────

/** Un tiro de arco jugando: aguantar 1,3 s y soltar. */
function tiroDeArco(p) {
  for (let t = 0; t < 1.3; t += DT) p.paso(true);
  for (let t = 0; t < 2 && !p.ev.tiros.length; t += DT) p.paso(false);
  return p.ev.tiros[0] ?? null;
}

// CORRECCIÓN DEL 99, parte R (doc/GUION_99.md). Las dos pruebas de abajo
// nacieron con «la lectura de hoy»: tres ataques a prioridad 0 —la flecha de
// `base_ranged`, su copia y la esfera— y la esfera la mitad de las veces. Con el
// `if` viejo (`if !CUSTOM_ATTACK`, base_ranged.script:23, script.cpp:5754-5757)
// la flecha de `base_ranged` no existe, y con `local` por evento (script.cpp:
// 5696) la «copia» es el ataque VACÍO de `bows_base`, que no se dispara nunca y
// `Brazo` no se queda. Queda UN ataque que tira: la esfera sale SIEMPRE, con la
// moneda que sea — que es lo que la parte P dejó escrito que pasaría.
test("el arco de Torkalath tira la esfera con cualquier moneda (el `if` viejo y `local` por evento, el 99)", { skip: sinArmas }, () => {
  for (const z of [0.1, 0.9]) {
    const p = partida("bows_telf1", { azar: () => z });
    const tiro = tiroDeArco(p);
    assert.equal(tiro?.ataque.proyectil, "proj_arrow_spiral", `azar ${z}`);
    assert.equal(tiro?.flecha?.ficha?.id, "proj_arrow_spiral", `azar ${z}`);
  }
});

test("y con la moneda de verdad, 200 de 200 esferas", { skip: sinArmas }, () => {
  let semilla = 99;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  const n = { proj_arrow_spiral: 0, proj_arrow_generic: 0 };
  for (let k = 0; k < 200; k++) {
    const id = tiroDeArco(partida("bows_telf1", { azar }))?.flecha?.ficha?.id;
    n[id] = (n[id] ?? 0) + 1;
  }
  assert.equal(n.proj_arrow_spiral, 200, JSON.stringify(n));
});

// El 99, parte R: ya no son «dos clones idénticos» sino la flecha y el ataque
// VACÍO de `bows_base` (ver arriba). El control sigue valiendo igual.
test("CONTROL: el arco de partida tira lo mismo salga lo que salga la moneda", { skip: sinArmas }, () => {
  for (const z of [0.1, 0.9]) {
    const p = partida("bows_treebow", { azar: () => z });
    assert.equal(tiroDeArco(p)?.flecha?.ficha?.id, "proj_arrow_generic", `azar ${z}`);
  }
});
