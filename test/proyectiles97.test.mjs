// LOS PROYECTILES QUE HACEN SU DAÑO POR GUION, LAS SAETAS INSTANTÁNEAS, LOS
// GUANTELETES QUE SE BORRAN Y SOLTAR CON SERVIDOR — experimento 97.
//
// Las reglas están en `src/play/proyectilguion.js` y se prueban con sus números
// citados. Pero la lección del 59 y del 63 —la prueba que construye ella el
// argumento que el juego no pasa— obliga a probar también la COSTURA: aquí se
// monta el arco de verdad (`montarArco`, src/juego/arco.js) sobre un mundo de
// mentira, con las fichas que salen del horneado (`build/msr/armas.json`), y se
// dispara por `tirar`, que es lo que llama el bucle.
//
// Necesita `build/msr/armas.json` y `build/msr/suelo.json` (`npm run armas` y
// `npm run suelo`); sin ellos esas pruebas se saltan, y lo dicen.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROYECTILES_DE_GUION, danoDeLanza, explosionDelFenix, danoEnArea,
  multiplicadorDeSaeta, esInstantanea, danoDeSaeta, cuentaDeProyectilesDeGuion,
} from "../src/play/proyectilguion.js";
import { leerFichaObjeto } from "../src/bsp/script.js";
import { montarArco } from "../src/juego/arco.js";
import { Suelo } from "../src/play/suelo.js";
import { MENSAJE } from "../src/red/protocolo.js";
import { Partida } from "../src/red/partida.js";
import { ClienteDeRed } from "../src/red/cliente.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ARMAS = join(RAIZ, "build/msr/armas.json");
const SUELO = join(RAIZ, "build/msr/suelo.json");
const SCRIPTS = join(RAIZ, "../MSC/MSCScripts/scripts");
const leer = (r) => JSON.parse(readFileSync(r, "utf8"));
const sinArmas = !existsSync(ARMAS) && "sin build/msr/armas.json (npm run armas)";
const sinSuelo = !existsSync(SUELO) && "sin build/msr/suelo.json (npm run suelo)";
const sinScripts = !existsSync(SCRIPTS) && "sin ../MSC/MSCScripts";
const cerca = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── 1. LA COMILLA SIMPLE DE UN `const` ─────────────────────────────────────

test("proj_arrow_frost: `'$rand(60,100)'` se lee 60-100, porque GetVar quita las comillas de un const", { skip: sinScripts }, () => {
  const f = leerFichaObjeto(SCRIPTS, "items/proj_arrow_frost");
  assert.deepEqual(f.proyectil.dano, { min: 60, max: 100 });
  // Y el control de que la regla es de las DECLARACIONES y no de los
  // parámetros de un comando: la flecha gratis, sin comillas, sigue igual.
  assert.deepEqual(leerFichaObjeto(SCRIPTS, "items/proj_arrow_generic").proyectil.dano, { min: 30, max: 60 });
});

test("en el catálogo horneado la escarcha trae 60-100 y las saetas son instantáneas", { skip: sinArmas }, () => {
  const fl = new Map(leer(ARMAS).flechas.map((f) => [f.id, f]));
  assert.deepEqual(fl.get("proj_arrow_frost").dano, { min: 60, max: 100 });
  for (const id of ["proj_bolt_generic", "proj_bolt_wooden", "proj_bolt_iron", "proj_bolt_steel"]) {
    assert.equal(fl.get(id)?.instantanea, true, id);
  }
  assert.equal(fl.get("proj_bolt_steel").soloPesada, true);
  assert.equal(fl.get("proj_arrow_generic").instantanea, false);
  assert.equal(fl.get("proj_arrow_phx").ignoraNpc, true);
});

test("`ammodrain 0`: las lanzas no gastan munición y la ballesta sí (1 por omisión)", { skip: sinArmas }, () => {
  const a = new Map(leer(ARMAS).armas.map((x) => [x.id, x]));
  const tiro = (id) => a.get(id).ataques.find((t) => t.tipo === "charge-throw-projectile");
  assert.equal(tiro("polearms_tri").gastaMunicion, 0);
  assert.equal(tiro("polearms_tri").proyectil, "proj_pole_trident");
  // CORRECCIÓN DEL 99, parte R (doc/GUION_99.md): aquí se leía «el primero es
  // la flecha normal» del Fénix, que es la de `base_ranged` detrás de `if
  // !CUSTOM_ATTACK` —un `if` viejo que abandona el evento, script.cpp:5754-
  // 5757—. Con el `if` viejo aplicado el Fénix ya no la tiene: su único tiro es
  // el suyo. El «1 por omisión» de un arco se mira en el arco de partida.
  assert.equal(tiro("bows_treebow").gastaMunicion, 1);
  assert.equal(tiro("bows_firebird").proyectil, "proj_arrow_phx");
  assert.equal(a.get("bows_firebird").ataques.find((t) => t.proyectil === "proj_arrow_phx").gastaMunicion, 0);
  assert.equal(tiro("bows_crossbow_light").gastaMunicion, 1);
  assert.equal(tiro("bows_crossbow_light").proyectil, "bolt");
});

// ── 2. LAS REGLAS, CON SUS NÚMEROS ────────────────────────────────────────

test("las doce de la tabla, y cuáles están portadas (calculado)", () => {
  const c = cuentaDeProyectilesDeGuion();
  assert.equal(c.total, 12);
  // EL 98: los tres que quedaban (`proj_pole_sl`, `proj_arrow_spiral`,
  // `proj_ub`) están portados; sus pruebas, en test/armas98.test.mjs.
  assert.deepEqual(c.sinPortar.sort(), []);
  for (const [id, r] of Object.entries(PROYECTILES_DE_GUION)) assert.match(r.cita, /\.script:\d+/, id);
});

test("lanzas: base × polearms/100 × (carga·k + 1), con el recorte de cerca", () => {
  // Tridente con 10 de asta, lejos: 175 × 0,1 × (0·1,5 + 1) = 17,5.
  assert.ok(cerca(danoDeLanza("proj_pole_trident", { habilidad: 10, distancia: 600 }).dano, 17.5));
  // Sin `PLR_SPEAR_CHARGE_LEVEL` puesto el factor es 1, NO 0 (atof del nombre).
  const sin = danoDeLanza("proj_pole_harpoon", { habilidad: 10, distancia: 600, cargaLanza: null }).dano;
  assert.ok(cerca(sin, 17.5), `${sin}`);
  // Con la carga del lanzamiento por guion (1,5): 175 × 0,1 × (1,5·3 + 1).
  assert.ok(cerca(danoDeLanza("proj_pole_harpoon", { habilidad: 10, distancia: 600, cargaLanza: 1.5 }).dano, 17.5 * 5.5));
  // La lanza del bastón a 128 u: la mitad (128/256).
  assert.ok(cerca(danoDeLanza("proj_pole_spear", { habilidad: 10, distancia: 128 }).dano, 7.5 * 0.5));
  // El tridente NO recorta de cerca: es una diferencia entre guiones.
  assert.ok(cerca(danoDeLanza("proj_pole_trident", { habilidad: 10, distancia: 128 }).dano, 17.5));
  // El Ice Typhoon pega en FRÍO aunque su PROJ_DAMAGE_TYPE diga pierce.
  assert.equal(danoDeLanza("proj_pole_ti", { habilidad: 10 }).tipo, "cold");
});

test("las de 800 sólo pegan a quien es ENEMIGO del tirador (una rata recela)", () => {
  assert.ok(cerca(danoDeLanza("proj_pole_holy", { habilidad: 10, relacion: "enemy" }).dano, 80));
  const r = danoDeLanza("proj_pole_holy", { habilidad: 10, relacion: "wary" });
  assert.equal(r.dano, 0);
  assert.match(r.porQue, /wary/);
  // El tridente no pregunta.
  assert.ok(danoDeLanza("proj_pole_trident", { habilidad: 10, relacion: "wary" }).dano > 0);
});

test("el Fénix: de power a 3·power y de 32 a 256 u según lo lejos que estalle", () => {
  let e = explosionDelFenix({ distancia: 0, potencia: 40, arqueria: 30 });
  assert.ok(cerca(e.dano, 40) && cerca(e.radio, 32));
  e = explosionDelFenix({ distancia: 512, potencia: 40, arqueria: 30 });
  assert.ok(cerca(e.dano, 80) && cerca(e.radio, 144));
  e = explosionDelFenix({ distancia: 5000, potencia: 40, arqueria: 30 });
  assert.ok(cerca(e.dano, 120) && cerca(e.radio, 256));
  // Con menos de 25 de arquería: × 0,1 y radio a la mitad.
  e = explosionDelFenix({ distancia: 5000, potencia: 40, arqueria: 24 });
  assert.ok(cerca(e.dano, 12) && cerca(e.radio, 128) && e.torpe);
});

test("el área del motor: caída 0 es el daño entero dentro del radio, y nada en el borde", () => {
  assert.equal(danoEnArea(100, 90, 100, 0), 100);
  assert.equal(danoEnArea(100, 100, 100, 0), 0);
  assert.ok(cerca(danoEnArea(100, 50, 100, 1), 50));
});

test("saetas: arquería/100 × PROJ_DAMAGE × el multiplicador de LA BALLESTA", () => {
  assert.ok(cerca(danoDeSaeta({ arqueria: 20, base: 100, multiplicador: multiplicadorDeSaeta("bows_crossbow_light", 20) }), 20));
  assert.equal(multiplicadorDeSaeta("bows_crossbow_heavy33", 20), 2.0);
  assert.equal(multiplicadorDeSaeta("bows_crossbow_heavy33", 19), 0.1);
  assert.equal(multiplicadorDeSaeta("bows_sxbow", 35), 1.5);
  // La de acero sólo es instantánea en una ballesta que se llame «Heavy»/«Steam».
  const acero = { instantanea: true, soloPesada: true };
  assert.equal(esInstantanea(acero, "Crossbow"), false);
  assert.equal(esInstantanea(acero, "Heavy Crossbow"), true);
  assert.equal(esInstantanea({ instantanea: true }, "Crossbow"), true);
});

// ── 3. LA COSTURA: el arco de verdad sobre un mundo de mentira ─────────────
//
// El mundo es un plano vertical a `z = -paredZ` metros (lo que se toque ahí es
// un bicho si `bicho` está puesto, si no la pared) y un suelo en `y = 0`.

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
function arcoDePrueba({ arma, nombre = "Arma", ataques, paredZ = 5, conBicho = true, candidatos = [], habilidades = null }) {
  const cat = leer(ARMAS);
  const flechas = new Map(cat.flechas.map((f) => [f.id, f]));
  const goblin = { id: 1, ficha: { nombre: "Goblin", relacion: 4 }, nodo: { position: { x: 0, y: 0, z: -paredZ } }, vida: 100, muerto: false };
  const heridas = [];
  const sucesos = [];
  const hab = habilidades ?? {
    archery: { proficiency: { valor: 20 }, balance: { valor: 20 }, power: { valor: 20 } },
    polearms: { proficiency: { valor: 10 }, balance: { valor: 10 }, power: { valor: 10 } },
  };
  const a = montarArco({
    RAPIER: { Ray: Rayo }, world: () => mundo({ paredZ, bicho: conBicho ? goblin : null }),
    player: () => ({ pitch: 0, yaw: 0, eye: [0, 1.6, 0], feet: [0, 0, 0], perfil: { height: 72 / U }, body: {} }),
    U: () => U,
    sesion: () => ({ personaje: { habilidades: hab, objetos: [] } }),
    bichos: () => ({ herir: (i, dano, o) => { heridas.push({ i, dano, ...o }); return { muerto: false }; } }),
    bichosSolidos: () => ({ puestos: [{ colisionador: { handle: 7 }, instancia: goblin }] }),
    brazo: () => ({ arma: { id: arma, nombre, animaciones: {} }, ataques }),
    catalogoDeFlechas: () => flechas,
    suceso: (t, m) => sucesos.push({ t, m }),
    potenciaDe: () => 50, destrezaDe: () => 0,
    candidatosVivos: () => candidatos.map((c) => ({ id: { ...goblin, ficha: { nombre: c.nombre } }, centro: c.centro })),
    trazaDelMundo: () => true,
  });
  return { a, goblin, heridas, sucesos };
}

test("COSTURA: la saeta de la ballesta ligera hiere AL DISPARAR, sin un solo paso de vuelo", { skip: sinArmas }, () => {
  const cat = new Map(leer(ARMAS).armas.map((x) => [x.id, x]));
  const xbow = cat.get("bows_crossbow_light");
  const { a, heridas } = arcoDePrueba({ arma: xbow.id, nombre: xbow.nombre, ataques: xbow.ataques });
  const f = a.tirar(xbow.ataques[0], 0.1);
  // Sin saetas en la mochila sale la SAETA gratis, no la flecha de arco.
  assert.equal(f.ficha.id, "proj_bolt_generic");
  assert.equal(f.volando, false, "la saeta ya no vuela: el rayo es instantáneo");
  assert.equal(heridas.length, 1, "un daño, en el mismo `tirar`");
  // arquería 20 (valor de la habilidad) / 100 × 100 × 1.
  assert.ok(cerca(heridas[0].dano, 20), `${heridas[0].dano}`);
  assert.equal(f.dano, 0, "y la saeta no lleva daño de motor (reg.proj.dmg 0)");
  assert.equal(a.deGuion.saetas.length, 1);
  assert.equal(a.deGuion.saetas[0].contra, "Goblin");
});

test("COSTURA (control positivo): la flecha de arco NO hiere hasta volar", { skip: sinArmas }, () => {
  const cat = new Map(leer(ARMAS).armas.map((x) => [x.id, x]));
  const arco = cat.get("bows_treebow");
  const { a, heridas } = arcoDePrueba({ arma: arco.id, ataques: arco.ataques, paredZ: 8 });
  const f = a.tirar(arco.ataques[0], 1.3);
  assert.equal(f.ficha.id, "proj_arrow_generic");
  assert.equal(heridas.length, 0, "aún no");
  for (let k = 0; k < 120 && f.volando; k++) a.pasoDeFlechas(1 / 60);
  assert.equal(f.volando, false);
  assert.equal(heridas.length, 1);
});

test("COSTURA: el tridente tira SU lanza y pega dos veces: el motor (1) y su guion (175)", { skip: sinArmas }, () => {
  const cat = new Map(leer(ARMAS).armas.map((x) => [x.id, x]));
  const tri = cat.get("polearms_tri");
  const tiro = tri.ataques.find((t) => t.tipo === "charge-throw-projectile");
  const { a, heridas } = arcoDePrueba({ arma: tri.id, ataques: tri.ataques, paredZ: 10 });
  const f = a.tirar(tiro, 1);
  assert.equal(f.ficha.id, "proj_pole_trident", "no la flecha gratis");
  for (let k = 0; k < 240 && f.volando; k++) a.pasoDeFlechas(1 / 60);
  const delGuion = heridas.find((h) => h.cubo?.startsWith("polearms.") && h.tipo === "pierce" && h.dano > 1);
  assert.ok(delGuion, JSON.stringify(heridas.map((h) => [h.dano, h.cubo])));
  // 175 × (asta 10)/100 × 1: lejos de 256 u, sin recorte.
  assert.ok(cerca(delGuion.dano, 17.5), `${delGuion.dano}`);
  assert.equal(heridas.length, 2, "el del motor y el del guion");
});

test("COSTURA: la flecha del Fénix estalla contra la pared y quema a quien está en el radio", { skip: sinArmas }, () => {
  const cat = new Map(leer(ARMAS).armas.map((x) => [x.id, x]));
  const fb = cat.get("bows_firebird");
  const tiro = fb.ataques.find((t) => t.proyectil === "proj_arrow_phx");
  const pared = 8;
  const { a, heridas } = arcoDePrueba({
    arma: fb.id, ataques: fb.ataques, paredZ: pared, conBicho: false,
    candidatos: [
      // Con 20 de arquería el radio va a la mitad (≈50 u a 8 m): «cerca» a 36 u.
      { nombre: "cerca", centro: [0, 20, -pared * U + 30] },
      { nombre: "lejos", centro: [0, 30, -pared * U + 900] },
    ],
  });
  const f = a.tirar(tiro, 1.3);
  assert.equal(f.ficha.id, "proj_arrow_phx");
  assert.equal(f.miraAdelante, false, "ignorenpc: sin el rayo de 36 u");
  for (let k = 0; k < 240 && f.volando; k++) a.pasoDeFlechas(1 / 60);
  const e = a.deGuion.explosiones;
  assert.equal(e.length, 1);
  assert.equal(e[0].centro[1], 0, "el centro baja al suelo ($get_ground_height)");
  const esperado = explosionDelFenix({ distancia: e[0].distancia, potencia: 20, arqueria: 20 });
  assert.ok(cerca(e[0].dano, esperado.dano) && esperado.torpe, "20 de arquería < 25: recorte");
  assert.deepEqual(e[0].golpeados.map((g) => g.nombre), ["cerca"]);
  assert.equal(heridas.length, 1);
  assert.equal(heridas[0].tipo, "fire");
});

test("COSTURA: un tipo de munición sin gratis no tira nada y lo dice", { skip: sinArmas }, () => {
  const { a, sucesos } = arcoDePrueba({ arma: "x", ataques: [] });
  const f = a.tirar({ tipo: "charge-throw-projectile", proyectil: "dart", alcance: 500, sostener: [0.1, 0.1], gastaMunicion: 1 }, 0.1);
  assert.equal(f, null);
  assert.ok(sucesos.some((s) => s.m === "You don't have any dart"));
});

// ── 4. LOS GUANTELETES QUE SE BORRAN AL CAER ──────────────────────────────

test("Venom Claws (fe1/fe2): al soltarlos se borran — no quedan en el suelo — y se avisa", { skip: sinSuelo }, () => {
  const suelo = leer(SUELO);
  const catalogo = new Map(suelo.objetos.map((o) => [o.guion, o]));
  assert.equal(catalogo.get("blunt_gauntlets_fe1").seBorraAlCaer, true);
  assert.equal(catalogo.get("blunt_gauntlets_fe2").seBorraAlCaer, true);
  const s = new Suelo({ catalogo, azar: () => 0.5 });
  const o = s.tirar({ guion: "blunt_gauntlets_fe1", ojo: [0, 0, 64], mirando: [1, 0, 0] });
  assert.ok(o?.borrado, "devuelve la marca (quien llama vacía la mano)");
  assert.equal(s.objetos.length, 0, "y no hay nada en el suelo");
  const sal = s.recoger();
  assert.ok(sal.some((x) => x.tipo === "objeto_soltado" && x.mensaje === "You drop Venom Claws"));
  assert.ok(sal.some((x) => x.tipo === "objeto_borrado" && x.por === "deleteme"));
  // Control positivo: un arma normal sí se queda.
  assert.ok(s.tirar({ guion: "swords_novablade12", ojo: [0, 0, 64], mirando: [1, 0, 0] })?.i > 0);
  assert.equal(s.objetos.length, 1);
});

// ── 5. SOLTAR CON SERVIDOR ─────────────────────────────────────────────────

const APARICION = {
  mapa: "liso",
  nacimiento: { nombre: "el centro", escena: [0, 0.2, 0] },
  reaparicion: { nombre: "el centro", escena: [0, 0.2, 0] },
};
function buzon() {
  const dentro = [];
  return { dentro, enviar: (t) => dentro.push(JSON.parse(t)),
    ultimo: (tipo) => [...dentro].reverse().find((m) => m.t === tipo) ?? null, al: () => () => {} };
}

test("SOLTAR: el servidor vacía la mano, NO lo devuelve a la mochila, y la foto lo dice", async () => {
  const partida = new Partida({ mundo: await mundoLiso(), almacen: new AlmacenMemoria(), aparicion: APARICION });
  const b = buzon();
  const c = partida.conectar(b, { nombre: "Uno" });
  await partida.recibir(c.id, { t: MENSAJE.CREAR, personaje: { nombre: "Uno" } });
  await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: b.ultimo(MENSAJE.LISTA).personajes[0].id });
  const p = c.sesion.personaje;
  p.objetos.push({ id: "swords_novablade12", n: 1 });
  await partida.recibir(c.id, { t: MENSAJE.EMPUNAR, id: "swords_novablade12" });
  assert.equal(partida._estado(c).arma, "swords_novablade12");
  const enMochila = () => p.objetos.filter((o) => o.id === "swords_novablade12").length;
  // Soltar algo que NO es lo de la mano: no toca nada y lo dice.
  await partida.recibir(c.id, { t: MENSAJE.SOLTAR, id: "axes_dragon" });
  assert.equal(p.manos.derecha, "swords_novablade12");
  assert.match(b.ultimo(MENSAJE.FALLO)?.porque ?? "", /not holding axes_dragon/);
  await partida.recibir(c.id, { t: MENSAJE.SOLTAR, id: "swords_novablade12" });
  assert.equal(p.manos.derecha, null);
  assert.equal(enMochila(), 0, "soltar no es guardar");
  assert.equal(partida._estado(c).arma ?? null, null);
});

test("el cliente manda SOLTAR con `soltarArma`, y NO se desengancha (`soltar()` es otra cosa)", () => {
  // La primera versión se llamaba `soltar(id)` y la clase ya tenía un `soltar()`
  // más abajo —desengancharse del socket—: el segundo pisaba al primero y la `c`
  // DESCONECTABA al jugador. Lo cazó la sonda del 97 con dos Chrome.
  const c = Object.create(ClienteDeRed.prototype);
  const mandados = [];
  let desenganchado = false;
  c._mandar = (t, m) => mandados.push([t, m]);
  c._quitar = () => { desenganchado = true; };
  c.soltarArma("swords_novablade12");
  assert.deepEqual(mandados, [[MENSAJE.SOLTAR, { id: "swords_novablade12" }]]);
  assert.equal(desenganchado, false);
});
