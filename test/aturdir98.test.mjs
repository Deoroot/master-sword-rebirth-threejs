// EL 98: LOS BICHOS ATURDEN SOLOS.
//
// El 97 portó lo que le pasa al jugador aturdido (src/play/trabas.js) y probó
// que el guion del jabalí llega a él — pero llamándole el evento a mano. En
// una partida no aturdía nadie: la IA no hacía embestir al jabalí y el zombi
// enano no saltaba. Aquí se prueba que lo HACEN SOLOS.
//
// TODO ENTRA POR DONDE ENTRA EL JUEGO (CLAUDE.md §4, el 59 y el 63):
//
//   - el bicho es una `Manada` de verdad con la ficha que lee `leerFichaNpc`
//     del guion del MOD —sin tocarle `golpe` ni nada de su `ia`— y las
//     secuencias del `.mdl` de verdad, con sus eventos 600;
//   - su guion lo crea `InteraccionesNpc` enchufada con `enchufarA`, como
//     `src/main.js`;
//   - el jugador es un `GuionDelJugador` con `build/msr/jugador.json` y los
//     efectos horneados, y el `applyeffect` del bicho le llega por el gancho
//     `aplicarEfecto` de `InteraccionesNpc`, como en `main.js`;
//   - el tiempo es `relojes` + `cazar` + `inter.paso` + `jugador.paso`.
//
// Nadie llama a `npc_targetsighted`, a `boar_charge`, a `attack_2` ni pone
// `ANIM_ATTACK`: si el bicho aturde, es porque la IA ha hecho lo que hace el
// motor. Ver doc/ATURDIR_98.md.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { leerFichaNpc, modeloYAnimaciones, RELACION } from "../src/bsp/script.js";
import { Manada } from "../src/play/manada.js";
import { InteraccionesNpc } from "../src/juego/interacciones.js";
import { cargarGuion } from "../tools/scriptsmsr.mjs";
import { eventosDeSecuencia, animacionesDelGuion } from "../tools/bicho.mjs";
import { leerMdl } from "../src/bsp/mdl.js";
import { leerSecuencias } from "../src/bsp/mdlanim.js";
import { crearPersonaje } from "../src/juego/personaje.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";
import { TablaDeEfectos } from "../src/play/efectos.js";
import { trabasDelJugador } from "../src/play/trabas.js";
import { Teclas } from "../src/juego/teclas.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const MODELOS = "../MSC/assets/msr/models";
const JUGADOR = "build/msr/jugador.json";
const EFECTOS = "build/msr/efectosguion.json";
const HAY = existsSync(SCRIPTS) && existsSync(MODELOS) && existsSync(JUGADOR) && existsSync(EFECTOS);
const U = 39.37;
const DT = 1 / 60;
const leer = (f) => JSON.parse(readFileSync(f, "utf8"));

/** Un dado fijo, para que dos pasadas den lo mismo. */
function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Las secuencias de un `.mdl` de verdad, con la forma del horneado. */
function secuenciasDelModelo(relativo) {
  const m = leerMdl(`${MODELOS}/${relativo}.mdl`);
  return leerSecuencias(m).map((s, k) => ({
    indice: k, nombre: s.nombre, fps: s.fps, fotogramas: Math.max(1, s.nFotogramas), bucle: s.bucle,
    actividad: s.actividad, pesoActividad: s.pesoActividad, avance: s.avance, eventos: eventosDeSecuencia(m, k),
  }));
}

/**
 * Un bicho del mod, su guion y un jugador con su guion y sus efectos, a `aU`
 * unidades en +X del bicho. El jugador se queda QUIETO donde se le pone
 * (`colocar(aU)` lo vuelve a poner a `aU` del bicho de ese momento): con el
 * jugador pegado al bicho, como en el arnés del 92, un jabalí que embiste lo
 * persigue para siempre — lo enseñó la primera pasada, 16 000 unidades de
 * embestida sin alcanzarlo.
 */
function montar(script, modelo, { aU = 40, azar = dado(7), relacion = RELACION.ODIO } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, script));
  const manada = new Manada({
    mapa: "liso", unidadesPorMetro: U,
    razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_x", script, clave: "b",
      nombre: ficha.nombre ?? script, hp: 100000, ancho: ficha.ancho, alto: ficha.alto,
      parado: ficha.parado ?? "idle", andando: ficha.andando ?? "walk", piel: 0,
      escena: [0, 0, 0], yaw: 0, luz: [0, 0, 0],
      hostil: true, relacion,
      // La `ia` de la ficha TAL CUAL: su `golpe` es el `ANIM_ATTACK` al nacer.
      ia: { ...ficha.ia, vida: 100000 },
    }],
  }, {
    secuenciasPorClave: new Map([["b", secuenciasDelModelo(modelo)]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 40] }]]),
    azar,
  });
  const i = manada.instancias[0];
  const jug = { pies: null };
  const colocar = (d) => { jug.pies = [i.donde[0] + d / U, i.donde[1], i.donde[2]]; };
  colocar(aU);
  const pies = () => jug.pies;

  // EL JUGADOR, con su guion y su tabla de efectos (como test/aturdir97).
  const personaje = crearPersonaje({ nombre: "Ana" });
  const dicho = [];
  const jugador = new GuionDelJugador({
    ficha: leer(JUGADOR), personaje, efectos: new TablaDeEfectos(leer(EFECTOS)),
    suceso: (tipo, texto) => dicho.push({ t: manada.t, texto: String(texto) }),
    consejo: () => {}, dar: () => {}, ahora: () => manada.t, aviso: () => {},
  });
  const inter = new InteraccionesNpc({
    sesion: { personaje },
    guiones: { guiones: { [script]: cargarGuion(script) } },
    npcPorId: (id) => manada.de(id),
    suceso: () => {},
    losNpc: () => manada.instancias,
    dondeEstaElJugador: pies,
    unidadesPorMetro: U,
    animar: (inst, nombre, modo) => manada.playanim(inst, nombre, modo),
    // La puerta de `main.js`: el `applyeffect` de un bicho, al guion del jugador.
    aplicarEfecto: (ruta, params, o) => jugador.efectos.aplicar(ruta, params, o),
  });
  inter.enchufarA(manada);
  const golpes = [];
  const arnes = {
    libre: () => true,
    suelo: () => 0,
    veA: () => true,
    // Su CENTRO, 36 sobre los pies (el 82).
    objetivos: () => [{ id: "jugador", donde: [jug.pies[0] * U, jug.pies[1] * U + 36, jug.pies[2] * U], esJugador: true, relacion, ancho: 0 }],
    golpear: (_b, id, dano, tipo) => { golpes.push({ id, dano, tipo, t: manada.t }); return { parado: false, dano }; },
  };
  // Lo que se VE: qué animación pone el bicho y cuándo.
  const puestas = [];
  let gen = i.anim.gen;
  // El primer instante en que el jugador está trabado, y cuánto duró.
  const trabado = { desde: null, hasta: null, ultimas: null };
  const paso = () => {
    manada.relojes(DT);
    manada.cazar(DT, arnes);
    inter.paso(DT);
    jugador.paso(DT);
    if (i.anim.gen !== gen) { gen = i.anim.gen; puestas.push({ t: manada.t, nombre: i.anim.nombre }); }
    const tr = trabasDelJugador(jugador);
    if (tr.noAtacar && trabado.desde === null) { trabado.desde = manada.t; trabado.ultimas = tr; }
    if (!tr.noAtacar && trabado.desde !== null && trabado.hasta === null) trabado.hasta = manada.t;
  };
  const correr = (segundos, hasta = null) => {
    for (let t = 0; t < segundos; t += DT) { paso(); if (hasta?.()) return true; }
    return false;
  };
  const g = () => inter.guionesVivos.get(i.id) ?? null;
  const v = (n) => g()?.guion?.vars?.get(n);
  const recibidos = () => ({ ...(g()?.costuraCuenta?.recibidos ?? {}) });
  return { manada, inter, i, jugador, personaje, dicho, golpes, puestas, trabado, colocar, correr, g, v, recibidos };
}

const aturdidoDicho = (r) => r.dicho.some((x) => /^You have been stunned!/.test(x.texto));

// ── EL HORNEADO ─────────────────────────────────────────────────────────────

describe("el horneado ve las animaciones que un guion pone tras un `if (…)` (98)", { skip: !existsSync(SCRIPTS) }, () => {
  test("el salto del zombi enano (`attack2`) y las cornadas de lado del jabalí", () => {
    // dwarf_zombie_random.script:303 y boar_base.script:105-108: las dos
    // asignaciones de `ANIM_ATTACK` van detrás de un `if ( … )`.
    const z = animacionesDelGuion(SCRIPTS, "monsters/dwarf_zombie_random").nombres;
    assert.ok(z.has("attack2"), [...z].join(","));
    const j = animacionesDelGuion(SCRIPTS, "edana/boarhard").nombres;
    for (const a of ["gore_forward", "gore_left", "gore_right", "charge", "stompsnort"]) assert.ok(j.has(a), `${a}: ${[...j].join(",")}`);
  });
  test("y el horneado de Gate City y de Edana las trae (si está horneado)", {
    skip: !existsSync("build/gatecity/bichos/dwarf_male1_b53/bicho.json") || !existsSync("build/edana/bichos/monsters_boar1/bicho.json"),
  }, () => {
    const z = leer("build/gatecity/bichos/dwarf_male1_b53/bicho.json").secuencias;
    assert.ok(z.some((s) => s.nombre === "attack2" && s.eventos?.some((e) => e.opciones === "attack_2")),
      `sin \`attack2\`: el horneado es de antes del 98 (\`npm run mapa:bichos -- --mapa gatecity\`)`);
    const j = leer("build/edana/bichos/monsters_boar1/bicho.json").secuencias.map((s) => s.nombre);
    for (const a of ["gore_left", "gore_right", "charge"]) assert.ok(j.includes(a), `${a}: ${j.join(",")}`);
  });
});

// ── EL ZOMBI ENANO SALTA ──────────────────────────────────────────────────

describe("el zombi enano salta solo y el salto aturde (dwarf_zombie_random.script:298-316)", { skip: !HAY }, () => {
  test("el hacha grande: `attack` hasta que `attack_1` saca el 25 %, y entonces `attack2`, y el jugador queda aturdido", () => {
    const r = montar("monsters/dwarf_zombie_bigaxe", "dwarf/male1");
    // La ficha al nacer dice `attack`: el salto NO es la horneada.
    assert.equal(r.i.ficha.ia.golpe, "attack");
    r.correr(120, () => r.trabado.desde !== null);
    const nombres = r.puestas.map((p) => p.nombre);
    // CONTROL POSITIVO: ataca, y con la de siempre. Si no atacara, el cero de
    // abajo no diría nada.
    assert.ok(nombres.filter((n) => n === "attack").length >= 1, `ataques: ${nombres.join(",")}`);
    assert.ok((r.recibidos().attack_1 ?? 0) >= 1, JSON.stringify(r.recibidos()));
    // LA REGLA: la IA ha puesto `attack2` porque el guion lo pidió, y su
    // evento llegó al guion.
    assert.ok(nombres.includes("attack2"), `nunca saltó en 120 s: ${nombres.join(",")}`);
    assert.ok((r.recibidos().attack_2 ?? 0) >= 1, JSON.stringify(r.recibidos()));
    assert.ok((r.recibidos().npc_selectattack ?? 0) >= 1, "la IA pregunta con `npc_selectattack` antes de cada ataque");
    // Y EL EFECTO EN EL JUGADOR: trabado, con «You have been stunned!».
    assert.ok(r.trabado.desde !== null, "el jugador nunca quedó trabado");
    assert.ok(r.trabado.ultimas.noAtacar && r.trabado.ultimas.noSaltar && r.trabado.ultimas.porcentaje === 45,
      JSON.stringify(r.trabado.ultimas));
    assert.ok(aturdidoDicho(r), r.dicho.map((x) => x.texto).join(" | "));
    // El aturdimiento llega DESPUÉS de un `attack2`, no de un `attack`.
    const salto = r.puestas.find((p) => p.nombre === "attack2");
    assert.ok(salto.t <= r.trabado.desde, `salto a ${salto.t}, trabado a ${r.trabado.desde}`);
  });

  test("tras el salto vuelve a `attack` (`setvard ANIM_ATTACK ANIM_SLASH`, :311)", () => {
    const r = montar("monsters/dwarf_zombie_bigaxe", "dwarf/male1");
    r.correr(120, () => (r.recibidos().attack_2 ?? 0) >= 1);
    assert.ok((r.recibidos().attack_2 ?? 0) >= 1);
    const k = r.puestas.length;
    r.correr(6);
    const despues = r.puestas.slice(k).map((p) => p.nombre).filter((n) => /^attack/.test(n));
    assert.ok(despues.length >= 1 && despues[0] === "attack", despues.join(","));
  });

  test("el desarmado (tipo 0, `ATTACK2_CHANCE 0`) no salta nunca en 60 s, y ataca", () => {
    // `monsters/dwarf_zombie_unarmed` fuerza el tipo 0 (dwarf_zombie_unarmed.script);
    // si no existe ese guion, se salta.
    if (!existsSync(`${SCRIPTS}/monsters/dwarf_zombie_unarmed.script`)) return;
    const r = montar("monsters/dwarf_zombie_unarmed", "dwarf/male1");
    r.correr(60);
    const nombres = r.puestas.map((p) => p.nombre);
    assert.ok(nombres.includes("attack"), `CONTROL: ataca (${nombres.join(",")})`);
    assert.equal(r.v("ATTACK2_CHANCE"), "0");
    assert.ok(!nombres.includes("attack2"), nombres.join(","));
    assert.equal(r.trabado.desde, null);
  });
});

// ── EL JABALÍ EMBISTE ─────────────────────────────────────────────────────

describe("el jabalí embiste solo y la embestida aturde (boar_base.script:114-184)", { skip: !HAY }, () => {
  /**
   * La coreografía: cerca hasta que cornea una vez (deja `PUSH_VEL`, el `if`
   * viejo del 97), y luego lejos, a 400 unidades. Lo demás lo hace él.
   */
  function embestida(script, modelo, { corneaPrimero = true } = {}) {
    const r = montar(script, modelo, { aU: 60 });
    if (corneaPrimero) {
      r.correr(30, () => r.v("PUSH_VEL") !== undefined);
      assert.ok(r.v("PUSH_VEL") !== undefined, `no corneó en 30 s: ${JSON.stringify(r.recibidos())}`);
    }
    r.colocar(400);
    const vistoAntes = r.recibidos().npc_targetsighted ?? 0;
    r.correr(20, () => r.trabado.desde !== null);
    return { r, vistoAntes };
  }

  test("el «Ferocious Wild Boar» (`BOAR_CAN_CHARGE 1`): ve, embiste a ritmo 3 con `charge`, llega y aturde 3 s", () => {
    const { r, vistoAntes } = embestida("edana/boarhard", "monsters/boar1");
    assert.ok((r.recibidos().npc_targetsighted ?? 0) > vistoAntes, "`npc_targetsighted` lo dispara la caza");
    assert.ok(r.puestas.some((p) => p.nombre === "charge"), `corre con \`charge\` (ANIM_RUN): ${r.puestas.map((p) => p.nombre).join(",")}`);
    assert.ok(r.golpes.some((x) => x.dano === 4), `el golpe de la embestida, \`BOAR_CHARGE_DMG 4\`: ${JSON.stringify(r.golpes)}`);
    assert.ok(r.trabado.desde !== null, `no aturdió: ${JSON.stringify(r.recibidos())}`);
    assert.ok(aturdidoDicho(r), r.dicho.map((x) => x.texto).join(" | "));
    // Y al llegar para (`boar_charge_stop`): ritmo 1 y otra vez `run`.
    assert.equal(r.v("BOAR_IS_CHARGING"), "0");
    assert.equal(r.i.fisica.ritmoAndar, 1);
    // Tres segundos (boar_base.script:183), con la reserva llena: entre 2,9 y 3,3.
    r.correr(5);
    const dura = r.trabado.hasta - r.trabado.desde;
    assert.ok(dura > 2.8 && dura < 3.4, `${dura} s`);
  });

  test("mientras embiste, ritmo 3 y sin atacar (`movespeed 3`, `CAN_ATTACK 0`, :131-134)", () => {
    const r = montar("edana/boarhard", "monsters/boar1", { aU: 60 });
    r.correr(30, () => r.v("PUSH_VEL") !== undefined);
    r.colocar(600);
    const ok = r.correr(10, () => r.v("BOAR_IS_CHARGING") === "1");
    assert.ok(ok, "no empezó a embestir");
    assert.equal(r.i.fisica.ritmoAndar, 3);
    assert.equal(r.v("CAN_ATTACK"), "0");
  });

  test("de cerca no embiste (`$get(HUNT_LASTTARGET,dist) > 256`, :118)", () => {
    const r = montar("edana/boarhard", "monsters/boar1", { aU: 60 });
    r.correr(20);
    assert.ok((r.recibidos().npc_targetsighted ?? 0) >= 5, "CONTROL: lo ve");
    assert.ok((r.recibidos().gore_forward ?? 0) + (r.recibidos().gore_left ?? 0) + (r.recibidos().gore_right ?? 0) >= 1,
      `CONTROL: cornea ${JSON.stringify(r.recibidos())}`);
    assert.ok(!r.puestas.some((p) => p.nombre === "charge"));
    assert.notEqual(r.v("BOAR_IS_CHARGING"), "1");
  });

  test("las tres cornadas salen del sorteo de `npc_attack` (:103-109)", () => {
    const r = montar("edana/boarhard", "monsters/boar1", { aU: 60 });
    r.correr(40);
    const c = r.recibidos();
    assert.ok((c.npc_attack ?? 0) >= 5, JSON.stringify(c));
    const vistas = new Set(r.puestas.map((p) => p.nombre).filter((n) => /^gore_/.test(n)));
    assert.ok(vistas.size >= 2, [...vistas].join(","));
  });

  test("el «Wild Boar» común (`BOAR_CAN_CHARGE 0`, boar.script:11) no embiste nunca: en estos mapas no aturde", () => {
    const { r, vistoAntes } = embestida("monsters/boar", "monsters/boar");
    assert.ok((r.recibidos().npc_targetsighted ?? 0) > vistoAntes, "CONTROL: lo ve de lejos, como el otro");
    assert.ok(!r.puestas.some((p) => p.nombre === "charge"));
    assert.equal(r.trabado.desde, null);
  });

  test("EL FALLO DEL MOD: sin haber corneado, la embestida llega y NO aturde (el `if` viejo, :90)", () => {
    // Lejos desde el principio, y se para en el instante en que la embestida
    // pega: después, ya de cerca, cornea y deja `PUSH_VEL` para la siguiente.
    // (La primera versión miraba al final de 20 s y lo encontró puesto.)
    const r = montar("edana/boarhard", "monsters/boar1", { aU: 400 });
    const llego = r.correr(30, () => r.golpes.some((x) => x.dano === 4));
    assert.ok(llego, `CONTROL: la embestida llegó ${JSON.stringify(r.golpes)} ${JSON.stringify(r.recibidos())}`);
    assert.equal(r.v("PUSH_VEL"), undefined, "no había corneado");
    assert.ok((r.recibidos().game_damaged_other ?? 0) >= 1, "el golpe entró: `game_damaged_other` corrió");
    r.correr(0.2);
    assert.equal(r.trabado.desde, null);
  });
});

// ── EL TOQUE MÁS CORTO QUE UN FOTOGRAMA ──────────────────────────────────


describe("un toque de barra entre dos fotogramas salta una vez (input.cpp:344, :915, :1001)", () => {
  const almacen = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  test("abajo y arriba antes de mirar: la intención salta, y sólo esa vez", () => {
    const t = new Teclas({ almacen });
    t.abajo("Space"); t.arriba("Space");
    assert.equal(t.intencion().saltar, true, "el impulso cuenta (`state & 3`)");
    assert.equal(t.intencion().saltar, false, "y se borra al leerlo (`state &= ~2`)");
  });
  test("aguantada: salta en cada fotograma; la repetición del teclado no es otro impulso", () => {
    const t = new Teclas({ almacen });
    t.abajo("Space");
    assert.equal(t.intencion().saltar, true);
    t.abajo("Space");                       // repetición
    assert.equal(t.intencion().saltar, true);
    t.arriba("Space");
    assert.equal(t.intencion().saltar, false, "CONTROL: suelta y ya mirada, no salta");
  });
  test("`pulsada` a secas (el muerto que quiere levantarse) no se come el impulso", () => {
    const t = new Teclas({ almacen });
    t.abajo("Space"); t.arriba("Space");
    assert.equal(t.pulsada("saltar"), false);
    assert.equal(t.intencion().saltar, true);
  });
});
