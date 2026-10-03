// EL SALTO DE LA ARAÑA DEL 93: la de Gate City te salta encima y te envenena.
//
// `monsters/spider` NO envenena al morder (el 92). Su veneno es el SALTO:
//
//   { repeatdelay 4 … if $rand(0,99) < 20 … playanim critical jumpmiss … }
//                                                     spider.script:93-117
//   { frame_jump  setvelocity ent_me $relvel(0,320,120)  gravity .9 … }   :118-125
//   { spider_latch_checkhitground  if( $get(SPIDER_LATCH_TARGET,dist) < 70 ) … } :126-142
//   { spider_latch_hit  setfollow … align_bottom  applyeffect … effect_spiderlatch … } :143-157
//   { spider_latch_drop … playanim critical falloff }                      :164-174
//   { frame_falloffend  callevent 0.2 spider_latch_resetmovement }         :187-192
//
// TODO ENTRA POR DONDE ENTRA EL JUEGO (CLAUDE.md §4, el 59 y el 63): una
// `Manada` de verdad con las secuencias del `.mdl` de verdad, un
// `InteraccionesNpc` enchufado con `enchufarA` y su `animar` como en
// `src/main.js`, el guion del MOD partido por el analizador, y el veneno sobre
// un `GuionDelJugador` de verdad con la tabla de efectos del mod. Nadie llama
// a `_fisica`, `cuerpoDe`, `correrRepeticion` ni `spider_latch_hit` a mano.
//
// El 20 % del salto es `$rand` con el dado del guion (`Math.random`, porque
// `InteraccionesNpc` no le pasa otro): las pruebas lo fijan con una semilla y
// lo devuelven al acabar.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { Manada, FISICA } from "../src/play/manada.js";
import { InteraccionesNpc } from "../src/juego/interacciones.js";
import { Guion, partirGuion, velocidadRelativa } from "../src/play/guion.js";
import { GuionDeNpc, CIERRE_DE_BICHO, RelojDeGuiones } from "../src/play/npcguion.js";
import { TablaDeEfectos } from "../src/play/efectos.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";
import { cargarGuion, leerScript } from "../tools/scriptsmsr.mjs";
import { eventosDeSecuencia } from "../tools/bicho.mjs";
import { leerMdl } from "../src/bsp/mdl.js";
import { leerSecuencias } from "../src/bsp/mdlanim.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const HAY_MOD = existsSync(SCRIPTS) && existsSync(MODELOS);
const U = 39.37;
const DT = 1 / 60;

/** Un guion escrito aquí, partido por el analizador (la regla del 67). */
function corre(texto, entorno = {}) {
  const p = partirGuion(texto);
  const apuntes = [];
  const g = new Guion({ eventos: p.eventos, preload: p.preload, entorno: { ...entorno } });
  g.llamar("e");
  return { g, v: (n) => g.vars.get(n), apuntes };
}

/** `Math.random` con semilla mientras dura `fn`. */
function conSemilla(semilla, fn) {
  const real = Math.random;
  let s = semilla >>> 0;
  Math.random = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  try { return fn(); } finally { Math.random = real; }
}

/** Las secuencias de un `.mdl` de verdad, con la forma del horneado. */
function secuenciasDelModelo(relativo) {
  const m = leerMdl(`${MODELOS}/${relativo}`);
  return leerSecuencias(m).map((s, k) => ({
    indice: k, nombre: s.nombre, fps: s.fps, fotogramas: Math.max(1, s.nFotogramas), bucle: s.bucle,
    actividad: s.actividad, pesoActividad: s.pesoActividad, avance: s.avance, eventos: eventosDeSecuencia(m, k),
  }));
}

/** La tabla de efectos como la hornea `tools/efectosguion.mjs` (igual que `test/veneno91`). */
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

/**
 * Un bicho del mod con su modelo y su guion de verdad, y un jugador de verdad
 * (`GuionDelJugador`) a `aU` unidades en +X. `jug` se puede mover a mitad.
 */
function montar(script, { aU = 150, enSuelo = true, nacerLejos = false } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, script));
  const guion = cargarGuion(script);
  let s = 7;
  const azar = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const manada = new Manada({
    mapa: "liso", unidadesPorMetro: U, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_x", script, clave: "b", nombre: ficha.nombre, hp: ficha.hp, ancho: ficha.ancho, alto: ficha.alto,
      parado: ficha.parado, andando: ficha.andando, escena: [0, 0, 0], yaw: 0, luz: [0, 0, 0], hostil: true, relacion: -4,
      ia: { ...ficha.ia },
    }],
  }, { secuenciasPorClave: new Map([["b", secuenciasDelModelo(ficha.modelo)]]), azar });
  const i = manada.instancias[0];
  const sucesos = [];
  let t = 0;
  const personaje = { id: "P1", nombre: "Ana", vida: 1000, mana: 5, oro: 0, objetos: [], manos: {} };
  const heridas = [];
  const jugador = new GuionDelJugador({
    ficha: { eventos: [], preload: [] }, personaje, ahora: () => t, maximos: () => ({ vida: 1000, mana: 20 }),
    suceso: (tipo, x) => sucesos.push({ t, texto: String(x) }),
    efectos: tablaDe(["effects/effect_spiderlatch", "effects/dot_poison"]),
    herir: (g) => { heridas.push({ t, dano: g.dano, tipo: g.tipo, de: g.atacante?.nombre ?? null }); personaje.vida -= g.dano; },
  });
  const jug = [(nacerLejos ? 5000 : aU) / U, 0, 0];
  const inter = new InteraccionesNpc({
    sesion: { personaje }, guiones: { guiones: { [script]: guion } },
    losNpc: () => manada.instancias, npcPorId: (id) => manada.de(id),
    dondeEstaElJugador: () => jug, unidadesPorMetro: U,
    suceso: (tipo, x) => sucesos.push({ t, texto: String(x) }),
    // Como `src/main.js`: el `playanim` del guion llega a la manada… (EL 94:
    // con su modo, `bichos.playanim`; antes `manada.deUnaVez(inst, nombre)`)
    animar: (inst, nombre, modo) => manada.playanim(inst, nombre, modo),
    // …y el efecto, al guion del jugador.
    aplicarEfecto: (ruta, params, o) => jugador.efectos.aplicar(ruta, params, o),
  });
  inter.enchufarA(manada);
  const golpes = [];
  const arnes = {
    libre: () => true, suelo: () => 0, veA: () => true,
    // El centro del jugador, 36 sobre sus pies, y su `FL_ONGROUND` (main.js).
    objetivos: () => [{ id: "jugador", donde: [jug[0] * U, jug[1] * U + 36, jug[2] * U], esJugador: true, relacion: -4, ancho: 0, enSuelo }],
    golpear: (_b, id, dano, tipo) => { golpes.push({ t, dano, tipo }); return { parado: false, dano }; },
  };
  const g = () => inter.guionesVivos.get(i.id) ?? null;
  const rastro = (ev) => (g()?.guion?.rastro ?? []).filter((r) => r.evento === ev).length;
  const marcas = [];
  // Cada vez que se pone (o se REBOBINA) una animación: `gen` sube con las dos.
  let genAntes = null;
  const paso = () => {
    t += DT;
    manada.relojes(DT); manada.cazar(DT, arnes); inter.paso(DT); jugador.paso(DT);
    if (i.anim.gen !== genAntes) { genAntes = i.anim.gen; marcas.push({ t, anim: i.anim.nombre }); }
  };
  /** Corre hasta que `hasta()` o se acabe el plazo. Devuelve si se cumplió. */
  const correr = (segundos, hasta = null) => {
    for (let k = 0; k < segundos / DT; k++) { paso(); if (hasta?.()) return true; }
    return false;
  };
  return { manada, inter, i, g, rastro, correr, jug, golpes, heridas, sucesos, marcas, personaje, jugador, get t() { return t; } };
}

// ── EL INTÉRPRETE ───────────────────────────────────────────────────────────

describe("`$relvel` y lo que el salto le pide al cuerpo, desde texto", () => {
  test("`$relvel(0,320,120)` es adelante 320 y arriba 120 con los ángulos DEL BICHO (script.cpp:3605-3628)", () => {
    // yaw 0: adelante es +X. yaw 90: adelante es +Y. La «x» es la DERECHA, que
    // con yaw 0 es −Y (AngleVectors, mathlib.cpp:208).
    assert.equal(corre("{ e\n setvard V $relvel(0,320,120)\n}", { angulosDeMi: () => [0, 0, 0] }).v("V"), "(320.00,0.00,120.00)");
    assert.equal(corre("{ e\n setvard V $relvel(0,320,120)\n}", { angulosDeMi: () => [0, 90, 0] }).v("V"), "(0.00,320.00,120.00)");
    assert.equal(corre("{ e\n setvard V $relvel(10,0,0)\n}", { angulosDeMi: () => [0, 0, 0] }).v("V"), "(0.00,-10.00,0.00)");
  });
  test("la forma de dos vectores no pregunta al bicho: (pitch,yaw,roll),(derecha,adelante,arriba)", () => {
    const r = corre("{ e\n setvard V $relvel((0,180,0),(0,100,0))\n}");
    assert.equal(r.v("V"), "(-100.00,0.00,0.00)");
  });
  test("sin ángulos del bicho se APUNTA y vale su propio texto (script.cpp:4741), y `setvelocity` no se cree el vector", () => {
    const vistos = [];
    const r = corre("{ e\n setvard V $relvel(0,320,120)\n setvelocity ent_me $relvel(0,320,120)\n}", { velocidad: (...a) => vistos.push(a) });
    assert.equal(r.v("V"), "$relvel(0,320,120)");
    assert.ok(r.g.noSoportados.some((x) => x.nombre.startsWith("$relvel")));
    assert.equal(vistos.length, 0, "un getter sin soporte no manda al bicho a (0,0,0) (la guarda del `$`)");
  });
  test("`velocidadRelativa` es AngleVectors: con pitch y roll también", () => {
    const v = velocidadRelativa([90, 0, 0], [0, 1, 0]);      // mirando abajo: adelante es −Z
    assert.ok(Math.abs(v[2] + 1) < 1e-9 && Math.abs(v[0]) < 1e-9);
  });
  test("`gravity` nunca es cero: `V_max(atof(x), 0.001)` (scriptcmds.cpp:3464)", () => {
    const g = [];
    corre("{ e\n gravity 0\n gravity abc\n gravity .9\n}", { gravedad: (x) => g.push(x) });
    assert.deepEqual(g, [0.001, 0.001, 0.9]);
  });
  test("`setfollow`: `none`, uno solo (no hace nada) y `align_bottom` como subcadena (:5976-5993)", () => {
    const s = [];
    corre("{ e\n setfollow none\n setfollow ent_me\n setfollow player align_bottom\n setfollow player nada\n}",
      { seguir: (ref, o) => s.push([ref, o?.abajo ?? null]) });
    assert.deepEqual(s, [[null, null], ["player", true], ["player", false]]);
  });
  test("`setidleanim none` es la cadena vacía (npcscript.cpp:1462-1463); `movespeed` y `setanim.framerate` con `atof`", () => {
    const a = [];
    corre("{ e\n setidleanim none\n setidleanim hitbite\n movespeed -1\n setanim.framerate .5\n}",
      { animacionDeParado: (x) => a.push(["parado", x]), ritmoDeAndar: (x) => a.push(["andar", x]), ritmoDeAnimacion: (x) => a.push(["anim", x]) });
    assert.deepEqual(a, [["parado", ""], ["parado", "hitbite"], ["andar", -1], ["anim", 0.5]]);
  });
  test("sin gancho del cuerpo, los cinco se APUNTAN (no hay `=> {}`, el 66)", () => {
    const r = corre("{ e\n gravity 1\n movespeed 1\n setanim.framerate 1\n setidleanim idle\n setfollow none\n}");
    for (const c of ["gravity", "movespeed", "setanim.framerate", "setidleanim", "setfollow"]) {
      assert.ok(r.g.noSoportados.some((x) => x.nombre === c), c);
    }
  });
  test("`game.monster.<prop>` es `$get(ent_me,<prop>)` CON el gancho (script.cpp:4692-4700); sin él, su nombre", () => {
    const con = corre("{ e\n if ( game.monster.onground ) setvard S 1\n setvard N game.monster.name.full\n}",
      { propiedadDeMi: (p) => (p === "onground" ? "1" : null) });
    assert.equal(con.v("S"), "1");
    assert.equal(con.v("N"), "game.monster.name.full", "lo que el gancho no sabe sigue valiendo su nombre");
    const sin = corre("{ e\n if ( game.monster.onground ) setvard S 1\n}");
    assert.equal(sin.v("S"), undefined);
  });
});

// ── LOS `repeatdelay` DE UN BICHO ───────────────────────────────────────────

describe("los `repeatdelay` de un bicho de combate se arman, y el cierre manda", { skip: !HAY_MOD }, () => {
  const guionDe = (script, extra = {}) => {
    const reloj = new RelojDeGuiones();
    const g = new GuionDeNpc({
      ficha: cargarGuion(script), npc: { nombre: "x", script, origen: "0 0 0", vida: 10, vidaMax: 10 },
      programar: (s, q) => reloj.programar(s, q), cierre: CIERRE_DE_BICHO, ...extra,
    });
    return { g, reloj, correr: (s) => { for (let k = 0; k < s / 0.05; k++) reloj.paso(0.05); } };
  };
  test("la araña arma sus dos bloques sin nombre y NO `hunting_mode_go`, que se cuenta como cerrado", () => {
    const { g, correr } = guionDe("monsters/spider");
    correr(9);
    assert.equal(g.repeticiones.armadas, 2, JSON.stringify(g.repeticiones));
    assert.equal(g.repeticiones.cerradas, 1);
    assert.equal(g.costuraCuenta.cerrados.hunting_mode_go, 1);
    // El del salto es `repeatdelay 4`: dos vueltas en 9 s (a los 4 y a los 8).
    const del = Object.entries(g.repeticiones.vueltas).find(([k]) => k.includes("línea 93"));
    assert.equal(del?.[1], 2, JSON.stringify(g.repeticiones.vueltas));
  });
  test("un guion retirado (otra vida del bicho) deja de repetir", () => {
    const { g, correr } = guionDe("monsters/spider");
    correr(4.5);
    const antes = JSON.stringify(g.repeticiones.vueltas);
    g.retirar();
    correr(10);
    assert.equal(JSON.stringify(g.repeticiones.vueltas), antes);
    assert.ok(g.costuraCuenta.retirado >= 1);
  });
  test("un NPC sin cierre (al que se le habla) no arma nada, como hasta el 92", () => {
    const reloj = new RelojDeGuiones();
    const g = new GuionDeNpc({ ficha: cargarGuion("monsters/spider"), npc: { nombre: "x" }, programar: (s, q) => reloj.programar(s, q) });
    assert.equal(g.repeticiones.armadas, 0);
    assert.equal(reloj.pendientes > 0, true, "control: el reloj sí lleva los `callevent` con retraso de siempre");
  });
});

describe("`CAN_HUNT`: un cero de nacimiento no congela (el murciélago); uno de después, sí", { skip: !HAY_MOD }, () => {
  test("el murciélago nace colgado con `CAN_HUNT 0` (bat_base.script:28, :42) y la IA le deja cazar", () => {
    const g = new GuionDeNpc({ ficha: cargarGuion("monsters/bat"), npc: { nombre: "Bat" }, cierre: CIERRE_DE_BICHO });
    assert.equal(g.guion.vars.get("CAN_HUNT"), "0", "control: el guion lo ha puesto a 0 de verdad");
    assert.deepEqual(g.puede(), { cazar: true, atacar: true });
  });
  test("y tras un 1, el 0 SÍ cuenta (es el salto, spider.script:112-113)", () => {
    const g = new GuionDeNpc({ ficha: cargarGuion("monsters/bat"), npc: { nombre: "Bat" }, cierre: CIERRE_DE_BICHO });
    g.guion.vars.set("CAN_HUNT", "1");
    assert.equal(g.puede().cazar, true);
    g.guion.vars.set("CAN_HUNT", "0");
    assert.equal(g.puede().cazar, false);
  });
});

// ── EL SALTO ────────────────────────────────────────────────────────────────

describe("el salto de la araña de Gate City, con su modelo y su guion de verdad", { skip: !HAY_MOD }, () => {
  test("SALTA, SE PEGA Y ENVENENA: `jumpmiss` -> `frame_jump` -> `spider_latch_hit` -> `effect_spiderlatch` -> `dot_poison`", () => {
    conSemilla(12, () => {
      const r = montar("monsters/spider", { aU: 150 });
      const pegada = r.correr(120, () => r.rastro("spider_latch_hit") >= 1);
      assert.ok(pegada, `control: en 120 s salta (20 % cada 4 s): ${JSON.stringify(r.g()?.repeticiones)}`);
      assert.ok(r.marcas.some((m) => m.anim === "jumpmiss"), "el amago es la animación del mod (`ANIM_LATCH_ATTACK jumpmiss`)");
      assert.equal(r.rastro("frame_jump"), 1, "y el evento 600 del fotograma 22 de `jumpmiss` llega al guion");
      assert.equal(r.i.fisica.saltos, 1, "`setvelocity ent_me $relvel(0,320,120)` lanza el cuerpo");
      assert.ok(r.i.fisica.sigue && r.i.fisica.manda, "pegada (`setfollow … align_bottom`) y con el cuerpo en manos del guion");
      const tPegada = r.t;
      r.correr(0.5);
      assert.ok(Math.abs(r.i.donde[0] - r.jug[0]) < 1e-9 && Math.abs(r.i.donde[1] - r.jug[1]) < 1e-9, "en los PIES del jugador (cbase.cpp:305-310)");
      assert.equal(r.i.anim.nombre, "hitbite", "con `setidleanim hitbite` (spider.script:147) tras `playanim break`");
      r.correr(6);
      const venenos = r.heridas.filter((h) => h.tipo === "poison_effect");
      assert.ok(r.sucesos.some((s) => s.texto === "You have been poisoned!"), r.sucesos.map((s) => s.texto).join(" | "));
      assert.equal(venenos.length, 4, `5 por segundo durante 4 (SPIDER_LATCH_ATKDMG/ATKDUR): ${JSON.stringify(venenos)}`);
      assert.ok(venenos.every((h) => h.dano === 5 && h.de === "Leaping Cave Spider"), JSON.stringify(venenos));
      assert.ok(r.sucesos.some((s) => s.texto === "The poison subsides."));
      assert.equal(r.rastro("spider_latch_drop"), 1);
      const soltada = r.marcas.find((m) => m.anim === "falloff");
      assert.ok(soltada && Math.abs(soltada.t - tPegada - 4) < 0.1, `se suelta a los 4 s: ${soltada?.t} - ${tPegada}`);
    });
  });

  test("AGARRADA NO MUERDE (`CAN_ATTACK 0`), y al acabar `falloff` vuelve a cazar y a morder", () => {
    conSemilla(12, () => {
      const r = montar("monsters/spider", { aU: 150 });
      r.correr(120, () => r.rastro("spider_latch_hit") >= 1);
      const alPegarse = r.golpes.length + r.rastro("frame_bite1");
      r.correr(120, () => r.rastro("spider_latch_drop") >= 1);
      assert.equal(r.golpes.length + r.rastro("frame_bite1"), alPegarse, "ni un mordisco pegada");
      const vuelve = r.correr(10, () => r.rastro("spider_latch_resetmovement") >= 1);
      assert.ok(vuelve && r.rastro("frame_falloffend") === 1, "`frame_falloffend` (el 53 de 55, a ritmo 0,5) llega");
      assert.equal(r.g().guion.vars.get("CAN_HUNT"), "1");
      assert.equal(r.i.fisica.manda, false, "la IA recupera el cuerpo con `movespeed 1`");
      const antes = r.rastro("frame_bite1");
      r.correr(10);
      assert.ok(r.rastro("frame_bite1") > antes, "y vuelve a morder");
    });
  });

  test("APARTARSE EN EL AMAGO ESQUIVA EL SALTO: vuela ~107 u con la física del motor, cae, y vuelve a cazar", () => {
    conSemilla(12, () => {
      const r = montar("monsters/spider", { aU: 150 });
      const amago = r.correr(120, () => r.i.anim.nombre === "jumpmiss");
      assert.ok(amago, "control: hay amago");
      const x0 = r.i.donde[0];
      r.jug[0] += 300 / U;                      // 300 u más allá: fuera de los 70 de `checkhitground`
      let alto = 0;
      r.correr(3, () => { alto = Math.max(alto, r.i.donde[1] * U); return r.i.fisica.aterrizajes >= 1; });
      const vuelo = (r.i.donde[0] - x0) * U;
      // En continuo: 320 u/s (menos la fricción del primer fotograma en el
      // suelo, ×(1 − 4·dt), sv_phys.cpp) durante 2·120/(0,9·800) s = 99,6 u,
      // y una cumbre de 120²/(2·720) = 10 u. A pasos de 1/60 s sale algo más
      // —medido: 109,5 u y 11 u—, igual que en el motor, que también integra
      // a saltos de `host_frametime`. Lo que separa la regla es la GRAVEDAD
      // del guion (`gravity .9`, spider.script:120): con 1 —medido, rompiéndola
      // a propósito— serían 99,6 u y 10 u. Los umbrales están entre las dos.
      assert.ok(vuelo > 104 && vuelo < 115, `vuelo ${vuelo.toFixed(1)} u`);
      assert.ok(alto > 10.5 && alto < 12, `sube ${alto.toFixed(1)} u`);
      assert.equal(r.rastro("spider_latch_hit"), 0, "no se pega");
      r.correr(2);
      assert.equal(r.g().guion.vars.get("SPIDER_LATCHING"), "0", "`spider_latch_resetmovement` tras posarse (spider.script:134-139)");
      assert.equal(r.i.fisica.manda, false);
      assert.equal(r.heridas.length, 0, "y no hay veneno");
    });
  });

  test("SE LA QUITAS DE UN GOLPE: `npc_struck` -> `spider_latch_drop` (spider.script:194-198), y la caída NO se absorbe", () => {
    // `game_struck` es un evento de la costura, y dentro de la costura lo que
    // el guion pide al cuerpo se absorbe (el 91) — salvo con el cuerpo en
    // manos del guion (`absorbe`, el 93): si se absorbiera `playanim critical
    // falloff`, no saldría `frame_falloffend` y la araña se quedaría con
    // `CAN_HUNT 0` para siempre.
    conSemilla(12, () => {
      const r = montar("monsters/spider", { aU: 150 });
      r.correr(120, () => r.rastro("spider_latch_hit") >= 1);
      r.correr(1);
      assert.equal(r.rastro("spider_latch_drop"), 0, "control: sigue pegada");
      r.manada.herir(r.i, 1, { quien: "jugador" });
      assert.equal(r.rastro("spider_latch_drop"), 1, "el golpe la suelta");
      r.correr(0.1);
      assert.equal(r.i.anim.nombre, "falloff");
      // Y UNA RAREZA DEL MOD: el `callevent 4 spider_latch_drop` que dejó
      // `spider_latch_hit` (spider.script:156) NO se cancela, y a los 4 s de
      // pegarse vuelve a correr: `SPIDER_LATCHING` sigue a 1 hasta el reset
      // (:166, :184), así que REBOBINA la caída. Medido: la segunda `falloff`
      // a los 4,0 s de pegarse. Por eso el plazo de abajo es largo.
      assert.ok(r.correr(10, () => r.rastro("spider_latch_resetmovement") >= 1), "y vuelve a cazar");
      assert.equal(r.rastro("spider_latch_drop"), 2, "el `callevent` de los 4 s también ha corrido");
      assert.equal(r.marcas.filter((m) => m.anim === "falloff").length, 2, "y ha rebobinado la caída");
      assert.equal(r.g().guion.vars.get("CAN_HUNT"), "1");
    });
  });

  test("con el jugador EN EL AIRE no salta (`$get(HUNT_LASTTARGET,onground)`, spider.script:104)", () => {
    conSemilla(12, () => {
      const r = montar("monsters/spider", { aU: 150, enSuelo: false });
      r.correr(60);
      assert.ok(r.golpes.length >= 1, "control: está cazando y mordiendo");
      assert.equal(r.i.fisica.saltos, 0);
      assert.ok(Object.values(r.g().repeticiones.vueltas).some((n) => n >= 10), "control: el bloque del salto ha dado vueltas");
    });
  });

  test("LA RAREZA DEL MOD: un mordisco antes de `npc_post_spawn` la deja a ritmo 0, congelada", () => {
    // `frame_bite1` hace `setanim.framerate BASE_FRAMERATE` (spider.script:207-209)
    // y `BASE_FRAMERATE` no existe hasta `npc_post_spawn`
    // (base_self_adjust.script:141, `callevent 1.0`): `atof` de su nombre es
    // 0, `m_Framerate = 0` (npcscript.cpp:1588) y `pev->framerate = 0`
    // (msmonsterserver.cpp:2079). La animación de atacar no acaba nunca.
    conSemilla(12, () => {
      const r = montar("monsters/spider", { aU: 30 });
      // Por lo que RECIBE el guion (la costura), no por su rastro: `frame_bite1`
      // son DOS bloques con ese nombre (spider_base.script:31 y
      // spider.script:207) y el rastro apunta los dos.
      const mordiscos = () => r.g()?.costuraCuenta?.recibidos?.frame_bite1 ?? 0;
      r.correr(0.9, () => mordiscos() >= 1);
      assert.equal(mordiscos(), 1, "control: muerde antes del primer segundo");
      assert.equal(r.i.fisica.ritmoAnim, 0);
      r.correr(10);
      assert.equal(r.i.anim.nombre, "attack");
      assert.equal(mordiscos(), 1, "congelada: no vuelve a morder");
      assert.equal(r.g().guion.vars.get("BASE_FRAMERATE"), "1.0", "aunque la variable YA exista: nadie vuelve a pedir el ritmo");
    });
  });
});

describe("los números de la física del motor, escritos a mano con su cita", () => {
  test("`sv_gravity` 800, `sv_friction` 4, `sv_stopspeed` 100 (sv_phys.cpp:49, :52-53; multiplay_gamerules.cpp:168)", () => {
    // Cuando el número ES la regla va escrito aquí y no leído de la constante
    // que se prueba (el 75).
    assert.deepEqual({ ...FISICA }, { gravedad: 800, friccion: 4, parada: 100 });
  });
});

describe("CONTROL NEGATIVO: la cría y el goblin no saltan", { skip: !HAY_MOD }, () => {
  for (const script of ["monsters/spider_mini", "monsters/goblin"]) {
    test(`${script}: 60 s al lado y ni un salto`, () => {
      conSemilla(12, () => {
        const r = montar(script, { aU: 40 });
        r.correr(60);
        assert.ok(r.golpes.length >= 1 || r.manada.golpesDelGuion.pedidos >= 1, "control: pelea");
        assert.equal(r.i.fisica.saltos, 0);
        assert.equal(r.i.fisica.sigue, null);
        assert.equal(r.heridas.length, 0);
        assert.ok(!r.marcas.some((m) => m.anim === "jumpmiss"));
      });
    });
  }
});

// ── EL HORNEADO DE GATE CITY ────────────────────────────────────────────────

describe("Gate City trae horneadas las secuencias del salto", { skip: !existsSync("build/gatecity/bichos/monsters_spider/bicho.json") }, () => {
  test("`jumpmiss` con `frame_jump` en el 22 y `falloff` con `frame_falloffend` en el 53", () => {
    // `tools/bichos.mjs` hornea las secuencias que nombra la FICHA, y las del
    // salto las nombra el guion con `const ANIM_LATCH_*` (spider.script:80-83).
    // Sin ellas `playanim critical jumpmiss` cae en la secuencia 0, el
    // `frame_jump` no sale nunca y la araña se queda a medio salto con
    // `CAN_HUNT 0` PARA SIEMPRE. Si esto se pone rojo tras un `npm run
    // mapa:bichos`, la lista del horneado ha perdido el salto: doc/SALTO_93.md.
    const b = JSON.parse(readFileSync("build/gatecity/bichos/monsters_spider/bicho.json", "utf8"));
    const s = (n) => b.secuencias.find((x) => x.nombre === n);
    assert.ok(s("jumpmiss")?.eventos?.some((e) => e.frame === 22 && e.evento === 600 && e.opciones === "frame_jump"),
      `secuencias horneadas: ${b.secuencias.map((x) => x.nombre).join(" ")}`);
    assert.ok(s("falloff")?.eventos?.some((e) => e.frame === 53 && e.opciones === "frame_falloffend"));
    assert.ok(s("hitbite"), "la de ir agarrada (`ANIM_LATCH_ON`)");
  });
});
