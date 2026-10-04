// LOS TRES PROYECTILES QUE FALTABAN Y LAS SEIS ASTAS QUE NO LANZAN — experimento 98.
//
// `proj_pole_sl` (la ráfaga oscura al aterrizar), `proj_arrow_spiral` (la esfera
// de los arcos de Torkalath) y `proj_ub` (la sombra del Unholy Blade): las reglas
// con sus números citados en `src/play/proyectilguion.js`, y la COSTURA —el arco
// de verdad (`montarArco`) sobre un mundo de mentira, disparando por `tirar` y
// avanzando por `pasoDeFlechas`, que es lo que llama el bucle—, igual que
// test/proyectiles97.test.mjs.
//
// Y el lector: un ataque registrado dentro de `if ( POLE_CAN_POWER_THROW )` no
// existe si la constante es 0. Se le da TEXTO al lector (el 67 de CLAUDE.md:
// si hay un analizador, la prueba le da texto), y se recorren TODAS las astas.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROYECTILES_DE_GUION, ARCOS_DE_ESPIRAL, espiralDelArco, rafagaOscura, centroDeLaRafaga,
  danoDeSombra, golpesDeVuelo, danoEnArea,
} from "../src/play/proyectilguion.js";
import { leerFichaObjeto, condicionDeAtaque } from "../src/bsp/script.js";
import { montarArco } from "../src/juego/arco.js";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ARMAS = join(RAIZ, "build/msr/armas.json");
const SCRIPTS = join(RAIZ, "../MSC/MSCScripts/scripts");
const leer = (r) => JSON.parse(readFileSync(r, "utf8"));
const sinArmas = !existsSync(ARMAS) && "sin build/msr/armas.json (npm run armas)";
const sinScripts = !existsSync(SCRIPTS) && "sin ../MSC/MSCScripts";
const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const tiraDe = (ficha) => (ficha?.ataques ?? []).some((a) => a.tipo === "charge-throw-projectile");

// ── 1. LAS ASTAS QUE NO LANZAN ────────────────────────────────────────────

test("`if ( CONST )` de un solo trozo: atoi ≠ 0, con su `!` (scriptcmds.cpp:3963-3978)", () => {
  const k = new Map([["A", "1"], ["B", "0"], ["C", "A"], ["D", "$rand(0,1)"]]);
  assert.equal(condicionDeAtaque(k, "A"), true);
  assert.equal(condicionDeAtaque(k, "B"), false);
  assert.equal(condicionDeAtaque(k, "!B"), true);
  assert.equal(condicionDeAtaque(k, "C"), true, "una constante que es otra constante se resuelve");
  // Lo que no se sabe se deja como estaba: ni sí ni no.
  assert.equal(condicionDeAtaque(k, "D"), null);
  assert.equal(condicionDeAtaque(k, "NO_EXISTE"), null);
  assert.equal(condicionDeAtaque(k, "A equals 1"), null);
});

test("las seis astas sin POLE_CAN_POWER_THROW 1 no lanzan; las siete que lo declaran, sí", { skip: sinScripts }, () => {
  const sin = ["polearms_qs", "polearms_ba", "polearms_hal", "polearms_nag", "polearms_sp", "polearms_har"];
  for (const id of sin) {
    const f = leerFichaObjeto(SCRIPTS, `items/${id}`);
    assert.equal(tiraDe(f), false, id);
    assert.deepEqual(f.ataquesCondicionados.map((c) => c.condicion), ["POLE_CAN_POWER_THROW"], id);
  }
  // Control positivo: las que lo declaran conservan el tiro (si el lector
  // tirara TODOS los `if`, esto se pondría rojo).
  for (const id of ["polearms_tri", "polearms_a", "polearms_dra", "polearms_h", "polearms_ph", "polearms_sl", "polearms_ti"]) {
    assert.equal(tiraDe(leerFichaObjeto(SCRIPTS, `items/${id}`)), true, id);
  }
});

test("TODAS las astas del juego: lanza ⇔ declara `const POLE_CAN_POWER_THROW 1` (contado, no supuesto)", { skip: sinScripts }, () => {
  const astas = readdirSync(join(SCRIPTS, "items"))
    .filter((f) => /^polearms_.*\.script$/.test(f) && !/_cl\.script$/.test(f) && f !== "polearms_base.script")
    .map((f) => f.slice(0, -7));
  let lanzan = 0, total = 0;
  for (const id of astas) {
    const f = leerFichaObjeto(SCRIPTS, `items/${id}`);
    if (!f?.ataques?.length) continue;
    total++;
    const texto = readFileSync(join(SCRIPTS, "items", `${id}.script`), "latin1");
    const declara = /^\s*const\s+POLE_CAN_POWER_THROW\s+1\b/m.test(texto);
    // `polearms_test` no incluye `polearms_base`: ni declara ni lanza.
    assert.equal(tiraDe(f), declara, id);
    if (declara) lanzan++;
  }
  assert.equal(lanzan, 7);
  assert.ok(total >= 13, `${total}`);
});

test("el `if` VIEJO se apunta y NO se aplica (todavía): los arcos de Torkalath lo dicen", { skip: sinScripts }, () => {
  const f = leerFichaObjeto(SCRIPTS, "items/bows_telf1");
  assert.deepEqual(f.ataquesTrasIfViejo.map((c) => c.condicion), ["!CUSTOM_ATTACK"]);
  assert.equal(f.ataques.length, 3, "sigue con los tres ataques de antes del 98");
});

test("en el horneado: 7 astas lanzan y la lanza del bastón ya no está entre las flechas", { skip: sinArmas }, () => {
  const cat = leer(ARMAS);
  const lanzan = cat.armas.filter((a) => /^polearms_/.test(a.id) && tiraDe(a)).map((a) => a.id).sort();
  assert.deepEqual(lanzan, ["polearms_a", "polearms_dra", "polearms_h", "polearms_ph", "polearms_sl", "polearms_ti", "polearms_tri"]);
  const flechas = new Set(cat.flechas.map((f) => f.id));
  // Nadie las tira por el MOTOR: `proj_pole_spear` y `proj_pole_harpoon` salen
  // por el lanzamiento POR GUION (`ext_toss_spear`), que no está portado.
  assert.equal(flechas.has("proj_pole_spear"), false);
  assert.equal(flechas.has("proj_pole_harpoon"), false);
  assert.ok(flechas.has("proj_pole_trident") && flechas.has("proj_pole_sl"));
});

// ── 2. LAS REGLAS ─────────────────────────────────────────────────────────

test("los doce portados, y los tres nuevos con su forma", () => {
  for (const id of ["proj_pole_sl", "proj_arrow_spiral", "proj_ub"]) assert.equal(PROYECTILES_DE_GUION[id].portado, true, id);
  assert.deepEqual(PROYECTILES_DE_GUION.proj_arrow_spiral.vuelo, { primero: 0.01, periodo: 0.1, radio: 128, caida: 0, vida: 10 });
  assert.deepEqual(PROYECTILES_DE_GUION.proj_ub.vuelo, { primero: 0.01, periodo: 0.2, radio: 32, caida: 0.1, vida: 10 });
});

test("la ráfaga oscura: aflicción × 3 en 96 u, caída 0,1, y el centro baja al suelo si está a < 128 u", () => {
  const r = rafagaOscura({ afliccion: 20 });
  assert.deepEqual([r.dano, r.radio, r.caida, r.tipo, r.cubo], [60, 96, 0.1, "dark_effect", "spellcasting.affliction"]);
  // A media distancia: 60 · 0,5^0,1.
  assert.ok(cerca(danoEnArea(r.dano, 48, 96, r.caida), 60 * Math.pow(0.5, 0.1)));
  assert.deepEqual(centroDeLaRafaga([1, 100, 2], 0), [1, 0, 2]);
  assert.deepEqual(centroDeLaRafaga([1, 200, 2], 0), [1, 200, 2], "a 200 u del suelo no se pega");
  assert.deepEqual(centroDeLaRafaga([1, 200, 2], null), [1, 200, 2]);
});

test("la sombra del Unholy Blade: aflicción × 8 en 32 u (proj_ub.script:76-77, :91)", () => {
  const s = danoDeSombra({ afliccion: 10 });
  assert.deepEqual([s.dano, s.radio, s.caida, s.tipo, s.cubo], [80, 32, 0.1, "dark", "swordsmanship"]);
});

test("el reloj del área en vuelo: 0,01 y luego cada periodo, y nada desde los 10 s", () => {
  let g = golpesDeVuelo("proj_arrow_spiral", undefined, 0.35);
  assert.deepEqual(g.instantes.map((t) => +t.toFixed(2)), [0.01, 0.11, 0.21, 0.31]);
  g = golpesDeVuelo("proj_ub", undefined, 0.5);
  assert.deepEqual(g.instantes.map((t) => +t.toFixed(2)), [0.01, 0.21, 0.41]);
  // Continuando desde donde se quedó, sin repetir.
  const h = golpesDeVuelo("proj_ub", g.proximo, 0.65);
  assert.deepEqual(h.instantes.map((t) => +t.toFixed(2)), [0.61]);
  assert.equal(golpesDeVuelo("proj_ub", 9.99, 50).instantes.length, 1, "el de 9,99 y ya");
});

test("los arcos de Torkalath: escuela × ajuste, × 0,1 con arquería < 30", () => {
  const esc = (v) => (e) => v[e] ?? 0;
  let r = espiralDelArco("bows_telf1", { escuela: esc({ fire: 40 }), arqueria: 30 });
  assert.ok(cerca(r.dano, 26) && r.tipo === "fire_effect" && !r.cancela);
  r = espiralDelArco("bows_telf1", { escuela: esc({ fire: 40 }), arqueria: 29 });
  assert.ok(cerca(r.dano, 2.6), `${r.dano}`);
  r = espiralDelArco("bows_telf2", { escuela: esc({ fire: 15, ice: 40 }), arqueria: 30 });
  assert.ok(cerca(r.dano, 22) && r.tipo === "cold_effect" && !r.cancela);
  r = espiralDelArco("bows_telf3", { escuela: esc({ fire: 15, lightning: 20 }), arqueria: 30 });
  assert.ok(cerca(r.dano, 13) && r.tipo === "lightning_effect");
  // Un arco que no es de Torkalath no pone SPIRAL_DMG: 0.
  assert.equal(espiralDelArco("bows_treebow", {}).dano, 0);
  assert.deepEqual(Object.keys(ARCOS_DE_ESPIRAL), ["bows_telf1", "bows_telf2", "bows_telf3", "bows_telf4"]);
});

test("EL FALLO DEL ORIGINAL: el arco de escarcha también pide fuego 15, porque corre el `ranged_start` del de fuego", () => {
  const r = espiralDelArco("bows_telf2", { escuela: (e) => ({ fire: 10, ice: 90 })[e], arqueria: 50 });
  assert.equal(r.cancela, true);
  assert.deepEqual(r.mensajes, ["You lack the fire affinity to activate this bow's magic."]);
  // Y con las dos bajas salen los DOS mensajes, el del de fuego primero.
  const s = espiralDelArco("bows_telf2", { escuela: () => 0, arqueria: 50 });
  assert.deepEqual(s.mensajes, [
    "You lack the fire affinity to activate this bow's magic.",
    "You lack the ice affinity to activate this bow's magic.",
  ]);
});

test("el de caos sortea DOS veces y vale el segundo; cualquiera de los dos cancela", () => {
  const dado = (...v) => { let k = 0; return () => v[k++]; };
  const esc = (e) => ({ fire: 20, ice: 40, lightning: 5 })[e];
  // fuego y luego hielo: 40 × 0,75, frío.
  let r = espiralDelArco("bows_telf4", { escuela: esc, arqueria: 30, azar: dado(0.1, 0.5) });
  assert.ok(cerca(r.dano, 30) && r.tipo === "cold_effect" && !r.cancela, JSON.stringify(r));
  // rayo (5 < 15) y luego fuego: cancela por el PRIMERO aunque el segundo valga.
  r = espiralDelArco("bows_telf4", { escuela: esc, arqueria: 30, azar: dado(0.9, 0.1) });
  assert.equal(r.cancela, true);
  assert.deepEqual(r.mensajes, ["The projectile fails to form due to your lack of lightning affinity."]);
  assert.ok(cerca(r.dano, 15) && r.tipo === "fire_effect");
});

// ── 3. LA COSTURA ─────────────────────────────────────────────────────────

const U = 39.37;
class Rayo { constructor(o, d) { this.o = o; this.d = d; } }
function mundo({ paredZ = 5, bicho = null } = {}) {
  return {
    castRay(r, L, _s, _a, _b, _c, _excl, pred) {
      const { o, d } = r;
      if (d.y < -0.9) { const t = o.y / -d.y; return t <= L ? { timeOfImpact: t, collider: { handle: 99 } } : null; }
      if (!(d.z < -1e-6)) return null;
      const t = (o.z + paredZ) / -d.z;
      if (t < 0 || t > L) return null;
      const handle = bicho ? 7 : 98;
      if (pred && !pred({ handle })) return null;
      return { timeOfImpact: t, collider: { handle } };
    },
  };
}
const HAB = {
  archery: { proficiency: { valor: 30 }, balance: { valor: 30 }, power: { valor: 30 } },
  polearms: { proficiency: { valor: 10 }, balance: { valor: 10 }, power: { valor: 10 } },
  swordsmanship: { proficiency: { valor: 10 }, balance: { valor: 10 }, power: { valor: 10 } },
  spellcasting: { fire: { valor: 40 }, ice: { valor: 0 }, lightning: { valor: 0 }, divination: { valor: 0 }, affliction: { valor: 10 } },
};
function arcoDePrueba({ arma, ataques, paredZ = 5, conBicho = false, candidatos = [], habilidades = HAB }) {
  const cat = leer(ARMAS);
  const flechas = new Map(cat.flechas.map((f) => [f.id, f]));
  const goblin = { id: 1, ficha: { nombre: "Goblin", relacion: 4 }, nodo: { position: { x: 0, y: 0, z: -paredZ } }, vida: 100, muerto: false };
  const heridas = [];
  const sucesos = [];
  const a = montarArco({
    RAPIER: { Ray: Rayo }, world: () => mundo({ paredZ, bicho: conBicho ? goblin : null }),
    player: () => ({ pitch: 0, yaw: 0, eye: [0, 1.6, 0], feet: [0, 0, 0], perfil: { height: 72 / U }, body: {} }),
    U: () => U,
    sesion: () => ({ personaje: { habilidades, objetos: [] } }),
    bichos: () => ({ herir: (i, dano, o) => { heridas.push({ i, dano, ...o }); return { muerto: false }; } }),
    bichosSolidos: () => ({ puestos: [{ colisionador: { handle: 7 }, instancia: goblin }] }),
    brazo: () => ({ arma: { id: arma, nombre: arma, animaciones: {} }, ataques }),
    catalogoDeFlechas: () => flechas,
    suceso: (t, m) => sucesos.push({ t, m }),
    potenciaDe: () => 50, destrezaDe: () => 0,
    candidatosVivos: () => candidatos.map((c) => ({ id: { ...goblin, ficha: { nombre: c.nombre } }, centro: c.centro })),
    trazaDelMundo: () => true,
  });
  return { a, heridas, sucesos };
}
const armaDe = (id) => new Map(leer(ARMAS).armas.map((x) => [x.id, x])).get(id);
const OJO = 1.6 * U;   // la altura del ojo en unidades: la flecha vuela ahí

test("COSTURA: la esfera de Torkalath quema en vuelo a quien pasa a < 128 u, y al que está lejos no", { skip: sinArmas }, () => {
  const arco = armaDe("bows_telf1");
  const tiro = arco.ataques.find((t) => t.proyectil === "proj_arrow_spiral");
  const { a, heridas } = arcoDePrueba({
    arma: arco.id, ataques: arco.ataques, paredZ: 20,
    candidatos: [
      { nombre: "al lado", centro: [60, OJO, -300] },     // a 60 u de la línea de vuelo
      { nombre: "lejos", centro: [400, OJO, -300] },      // a 400: control negativo
    ],
  });
  const f = a.tirar(tiro, 1.3);
  assert.equal(f.ficha.id, "proj_arrow_spiral", "no la flecha gratis: ammodrain 0");
  assert.ok(f.areaDeVuelo, "nace con su área");
  assert.ok(cerca(f.areaDeVuelo.dano, 26), `${f.areaDeVuelo.dano}`);   // fuego 40 × 0,65
  for (let k = 0; k < 600 && a.flechasEnVuelo.length; k++) a.pasoDeFlechas(1 / 60);
  const areas = a.deGuion.areas.filter((x) => x.id === "proj_arrow_spiral");
  assert.ok(areas.length >= 3, `${areas.length} áreas`);
  const nombres = new Set(heridas.map((h) => h.i.ficha.nombre));
  assert.ok(nombres.has("al lado"), "el de al lado se quema");
  assert.equal(nombres.has("lejos"), false, "el de lejos no");
  for (const h of heridas) {
    // Caída 0: el daño ENTERO.
    assert.ok(cerca(h.dano, 26), `${h.dano}`);
    assert.equal(h.tipo, "fire_effect");
    assert.match(h.cubo, /^archery\.(proficiency|balance|power)$/);
  }
  // Y al chocar con la pared, `remove_me`: se va, sin quedarse clavada.
  assert.equal(a.flechasEnVuelo.length, 0);
});

test("COSTURA: el arco de escarcha sin fuego 15 no tira, y lo dice (el `ranged_start` del de fuego)", { skip: sinArmas }, () => {
  const arco = armaDe("bows_telf2");
  const tiro = arco.ataques.find((t) => t.proyectil === "proj_arrow_spiral");
  const hab = { ...HAB, spellcasting: { ...HAB.spellcasting, fire: { valor: 0 }, ice: { valor: 60 } } };
  const { a, sucesos } = arcoDePrueba({ arma: arco.id, ataques: arco.ataques, habilidades: hab });
  assert.equal(a.tirar(tiro, 1.3), null);
  assert.equal(a.flechasEnVuelo.length, 0);
  assert.ok(sucesos.some((s) => s.m === "You lack the fire affinity to activate this bow's magic."));
  assert.equal(a.deGuion.cancelados, 1);
});

test("COSTURA: la sombra del Unholy Blade pega aflicción × 8 con su caída a quien roza, cada 0,2 s", { skip: sinArmas }, () => {
  const ub = armaDe("swords_ub");
  const tiro = ub.ataques.find((t) => t.proyectil === "proj_ub");
  const { a, heridas } = arcoDePrueba({
    arma: ub.id, ataques: ub.ataques, paredZ: 20,
    candidatos: [{ nombre: "rozado", centro: [16, OJO - 3, -200] }, { nombre: "a 40", centro: [40, OJO, -200] }],
  });
  const f = a.tirar(tiro, 1);
  assert.equal(f.ficha.id, "proj_ub");
  assert.ok(cerca(f.areaDeVuelo.dano, 80));
  for (let k = 0; k < 900 && a.flechasEnVuelo.length; k++) a.pasoDeFlechas(1 / 60);
  assert.ok(heridas.length >= 1, "alguna vez le pasa a menos de 32 u");
  assert.ok(heridas.every((h) => h.i.ficha.nombre === "rozado"), "al de 40 u nunca");
  for (const h of heridas) {
    assert.ok(h.dano > 0 && h.dano <= 80, `${h.dano}`);
    assert.equal(h.tipo, "dark");
    assert.match(h.cubo, /^swordsmanship\./);
  }
  // Cada 0,2 s: los instantes de las áreas van de 0,2 en 0,2.
  const ts = a.deGuion.areas.filter((x) => x.id === "proj_ub").map((x) => x.t);
  for (let k = 1; k < ts.length; k++) assert.ok(cerca(ts[k] - ts[k - 1], 0.2, 1e-9));
});

test("COSTURA: la Shadow Lance revienta al aterrizar —en la pared o en el bicho— con aflicción × 3", { skip: sinArmas }, () => {
  const sl = armaDe("polearms_sl");
  const tiro = sl.ataques.find((t) => t.tipo === "charge-throw-projectile");
  const pared = 6;
  // En la pared: el centro baja al suelo (y = 0).
  {
    const { a, heridas } = arcoDePrueba({
      arma: sl.id, ataques: sl.ataques, paredZ: pared,
      candidatos: [{ nombre: "cerca", centro: [0, 36, -pared * U + 40] }, { nombre: "lejos", centro: [0, 36, -pared * U + 300] }],
    });
    const f = a.tirar(tiro, 1);
    assert.equal(f.ficha.id, "proj_pole_sl");
    for (let k = 0; k < 600 && f.volando; k++) a.pasoDeFlechas(1 / 60);
    const r = a.deGuion.areas.filter((x) => x.id === "proj_pole_sl");
    assert.equal(r.length, 1);
    assert.equal(r[0].centro[1], 0, "pegado al suelo ($get_ground_height)");
    assert.equal(r[0].dano, 30);   // aflicción 10 × 3
    assert.deepEqual(heridas.map((h) => h.i.ficha.nombre), ["cerca"]);
    const d = Math.hypot(...[0, 1, 2].map((k) => r[0].centro[k] - [0, 36, -pared * U + 40][k]));
    assert.ok(cerca(heridas[0].dano, danoEnArea(30, d, 96, 0.1)), `${heridas[0].dano}`);
    assert.equal(heridas[0].cubo, "spellcasting.affliction");
  }
  // En el bicho: la ráfaga también, y NINGÚN «Hit Goblin: 0» del motor.
  {
    const { a, heridas } = arcoDePrueba({ arma: sl.id, ataques: sl.ataques, paredZ: pared, conBicho: true, candidatos: [] });
    const f = a.tirar(tiro, 1);
    for (let k = 0; k < 600 && f.volando; k++) a.pasoDeFlechas(1 / 60);
    assert.equal(a.deGuion.areas.filter((x) => x.id === "proj_pole_sl").length, 1);
    assert.equal(heridas.length, 0, "el daño de motor es 0 y no se apunta");
  }
});

test("COSTURA: la esfera que toca a un bicho no es un flechazo — `ignorenpc`: sin `DoDamage` del motor, y se va", { skip: sinArmas }, () => {
  const arco = armaDe("bows_telf1");
  const tiro = arco.ataques.find((t) => t.proyectil === "proj_arrow_spiral");
  const { a, heridas } = arcoDePrueba({ arma: arco.id, ataques: arco.ataques, paredZ: 6, conBicho: true });
  const f = a.tirar(tiro, 1.3);
  for (let k = 0; k < 600 && a.flechasEnVuelo.length; k++) a.pasoDeFlechas(1 / 60);
  assert.equal(f.volando, false, "llegó al bicho");
  assert.equal(a.flechazos, 0, "el motor no le pega (giprojectile.cpp:146, :214-220)");
  assert.equal(heridas.length, 0);
  assert.equal(a.flechasEnVuelo.length, 0, "y `remove_me` la quita");
});
