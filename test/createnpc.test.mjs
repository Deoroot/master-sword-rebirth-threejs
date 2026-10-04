// `createnpc`: una entidad con guion, creada por otro guion — scriptcmds.cpp:2760-2816.
//
// Tres capas, y la de en medio y la de abajo entran por donde entra el juego
// (CLAUDE.md §4, el 59 y el 63):
//
//   1. EL INTÉRPRETE, desde TEXTO: lo parte `partirGuion`, no la prueba (el 67).
//   2. EL SEGUNDO CASO: un guion nuestro (`contenido/scripts/pruebas/oleada`)
//      que crea otro (`pruebas/cria`, la rata del juego con su
//      `game_dynamically_created`), con una `Manada` de verdad, un
//      `InteraccionesNpc` de verdad y el `MundoDeCreados` cableado como lo
//      cablea `src/main.js`.
//   3. LA BLOOD DRINKER, con SUS guiones del mod: el arma
//      (`items/swords_blood_drinker`) corre en un `GuionDeObjeto` y la
//      invocación (`monsters/summon/blood_drinker`) en la manada. Sale, vuela,
//      toca, pega, y la espada vuelve cuando lo dice el guion.
//
// Lo que NO se prueba aquí: el dibujo, el modelo a petición y `pasoDelBrazo`.
// Eso es de la sonda (`sondas/createnpc.mjs`).

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { Guion, partirGuion, entornoVacio, COMANDOS, GETTERS } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";
import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { RELACION } from "../src/bsp/razas.js";
import { Manada } from "../src/play/manada.js";
import { InteraccionesNpc, esDeCombate } from "../src/juego/interacciones.js";
import { GuionDeObjeto, GuionesDeObjeto } from "../src/play/guionobjeto.js";
import { MundoDeCreados, aMotor, aEscena, angulosDe, frenteDe, nombreDeRelacion, esSolido, ARMAS_QUE_INVOCAN } from "../src/play/creados.js";
import { valorDeHabilidad } from "../src/juego/stats.js";
import { creadosPor, creablesDe, lectorDe } from "../tools/creables.mjs";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const NUESTROS = "contenido/scripts";
const HAY_MOD = existsSync(SCRIPTS);
const U = 39.37;

/** Los guiones nuestros encima de los del juego, como `montarScripts` pero en memoria. */
const textoDe = (ruta) => {
  for (const raiz of [NUESTROS, SCRIPTS]) {
    const f = `${raiz}/${ruta}.script`;
    if (existsSync(f)) return readFileSync(f, "latin1");
  }
  return null;
};
const cache = new Map();
const leer = (ruta) => {
  if (!cache.has(ruta)) { const t = textoDe(ruta); cache.set(ruta, t === null ? null : partirGuion(t)); }
  return cache.get(ruta);
};
const cargar = (ruta) => resolverGuion(ruta, leer, new Set());

// ── 1. EL INTÉRPRETE ────────────────────────────────────────────────────────

/** Un guion suelto desde TEXTO, con un entorno que apunta lo que le piden. */
function guionDeTexto(texto, ganchos = {}) {
  const g = partirGuion(texto);
  const pedidos = [];
  const guion = new Guion({
    eventos: g.eventos, preload: g.preload, nombre: "prueba",
    entorno: { ...entornoVacio(), ...ganchos(pedidos) },
  });
  guion.llamar("", []);
  return { guion, pedidos };
}

describe("createnpc: el intérprete, desde texto", () => {
  const TEXTO = `
{ crear
	setvard DONDE (10,20,30)
	createnpc monsters/summon/cosa DONDE PARAM1 $int(7.9) cola
	setvard HECHO $get(ent_lastcreated,id)
}
{ corto
	createnpc monsters/summon/cosa
	setvard TRAS_CORTO $get(ent_lastcreated,id)
}
{ sinorigen
	createnpc monsters/summon/cosa $nohay(1,2) a
}
`;
  const conGancho = (asas) => (pedidos) => ({
    crearNpc: (script, origen, params) => { pedidos.push({ script, origen, params }); return asas.shift() ?? null; },
  });

  test("está en la lista de comandos, con los cuatro que pide una invocación", () => {
    for (const c of ["createnpc", "setcallback", "fly", "setanim.movespeed", "race"]) assert.ok(COMANDOS.has(c), c);
    for (const g of ["$vec", "$dir", "$get_tsphere", "$get_traceline"]) assert.ok(GETTERS.has(g), g);
  });

  test("parte el guion, el origen como vector y los parámetros YA resueltos del 3 en adelante", () => {
    const { guion, pedidos } = guionDeTexto(TEXTO, conGancho(["PentP(3,9)"]));
    guion.llamar("crear", ["el_primero"]);
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].script, "monsters/summon/cosa");
    assert.deepEqual(pedidos[0].origen, [10, 20, 30]);
    // PARAM1 resuelto, el getter resuelto y el literal tal cual: Params[2..] (:2805-2806).
    assert.deepEqual(pedidos[0].params, ["el_primero", "7", "cola"]);
  });

  test("`ent_lastcreated` es el asa que devolvió el gancho (scriptcmds.cpp:2797-2798)", () => {
    const { guion } = guionDeTexto(TEXTO, conGancho(["PentP(3,9)"]));
    assert.equal(guion.resolver("$get(ent_lastcreated,id)"), "0", "antes de crear nada vale «0»");
    guion.llamar("crear", ["x"]);
    assert.equal(guion.vars.get("HECHO"), "PentP(3,9)");
  });

  test("con menos de dos parámetros no crea nada (ERROR_MISSING_PARMS, :2812)", () => {
    const { guion, pedidos } = guionDeTexto(TEXTO, conGancho(["PentP(3,9)"]));
    guion.llamar("corto", []);
    assert.equal(pedidos.length, 0);
    assert.equal(guion.vars.get("TRAS_CORTO"), "0");
  });

  test("si la entidad no se crea, `ent_lastcreated` se queda con la de antes (`if (pEntity)`, :2794)", () => {
    const { guion, pedidos } = guionDeTexto(TEXTO, conGancho(["PentP(3,9)", null]));
    guion.llamar("crear", ["a"]);
    guion.llamar("crear", ["b"]);
    assert.equal(pedidos.length, 2);
    assert.equal(guion.vars.get("HECHO"), "PentP(3,9)");
  });

  test("sin gancho se APUNTA y no se inventa nada", () => {
    const { guion } = guionDeTexto(TEXTO, () => ({}));
    guion.llamar("crear", ["a"]);
    assert.ok(guion.noSoportados.some((x) => x.tipo === "comando" && x.nombre === "createnpc"));
    assert.equal(guion.vars.get("HECHO"), "0");
  });

  test("un origen que es un getter sin portar NO crea nada en el origen del mapa: se apunta", () => {
    const { guion, pedidos } = guionDeTexto(TEXTO, conGancho(["PentP(1,1)"]));
    guion.llamar("sinorigen", []);
    assert.equal(pedidos.length, 0);
    assert.ok(guion.noSoportados.some((x) => x.tipo === "vector sin getter"));
  });

  test("los getters de la invocación: `$vec`, `$dir`, `$get_tsphere` y `$get_traceline`", () => {
    const visto = [];
    const { guion } = guionDeTexto("{ nada\n}\n", () => ({
      enEsfera: (tipo, radio, centro) => { visto.push({ tipo, radio, centro }); return tipo === "enemy" ? ["PentP(1,1)", "PentP(2,2)"] : []; },
      trazar: (a, b) => (b[0] > 100 ? [50, 0, 0] : null),
    }));
    // `$vec` pega los textos sin tocarlos (script.cpp:4207-4213).
    assert.equal(guion.resolver("$vec(0,90,0)"), "(0,90,0)");
    assert.equal(guion.resolver("$vec(1,2)"), "0");
    // `$dir(a,b)` es de a HACIA b, normalizado (script.cpp:789-791).
    assert.equal(guion.resolver("$dir((0,0,0),(0,10,0))"), "(0.00,1.00,0.00)");
    assert.equal(guion.resolver("$dir((5,5,5),(5,5,5))"), "(0.00,0.00,1.00)", "el vector nulo: (0,0,1), hl/vector.h:112-113");
    // `$get_tsphere`: asas con `;` detrás de cada una, o «none» (script.cpp:2927-2928).
    assert.equal(guion.resolver("$get_tsphere(enemy,1024,(1,2,3))"), "PentP(1,1);PentP(2,2);");
    assert.deepEqual(visto[0], { tipo: "enemy", radio: 1024, centro: [1, 2, 3] });
    assert.equal(guion.resolver("$get_tsphere(ally,64)"), "none");
    assert.equal(visto[1].centro, null, "sin tercer parámetro, el centro es el propio (:2830)");
    // `$get_traceline` worldonly: sin choque, EL TEXTO que entró; con choque, el punto.
    assert.equal(guion.resolver("$get_traceline((0,0,0),(10.5,0,0),worldonly)"), "(10.5,0,0)");
    assert.equal(guion.resolver("$get_traceline((0,0,0),(200,0,0),worldonly)"), "(50.00,0.00,0.00)");
  });
});

describe("createnpc: la aritmética del vuelo", () => {
  test("escena <-> motor ida y vuelta, con la Y del motor en la −Z de la escena", () => {
    assert.deepEqual(aMotor([1, 2, 3], 10), [10, -30, 20]);
    assert.deepEqual(aEscena([10, -30, 20], 10), [1, 2, 3]);
  });
  test("`VecToAngles` da el cabeceo positivo hacia ARRIBA, y negado es el frente de `AngleVectors`", () => {
    const a = angulosDe([10, 10, 10]);
    assert.ok(Math.abs(a[1] - 45) < 1e-9);
    assert.ok(a[0] > 0 && a[0] < 90);
    const f = frenteDe([-a[0], a[1], 0]);
    const L = Math.hypot(10, 10, 10);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(f[k] - 10 / L) < 1e-9, `eje ${k}: ${f[k]}`);
    // Sin negarlo apunta hacia ABAJO: es la diferencia que hay que poder ver.
    assert.ok(frenteDe(a)[2] < 0);
  });
  test("`relationship`: el miedo también es «enemy» y el recelo es «wary» (scriptcmds.cpp:1392-1417)", () => {
    assert.equal(nombreDeRelacion(RELACION.MIEDO), "enemy");
    assert.equal(nombreDeRelacion(RELACION.ODIO), "enemy");
    assert.equal(nombreDeRelacion(RELACION.RECELO), "wary");
    assert.equal(nombreDeRelacion(RELACION.ALIADO), "ally");
    assert.equal(nombreDeRelacion(RELACION.SIN_RAZA), "neutral");
  });
  test("`esSolido` lee el `setsolid` del guion partido", () => {
    assert.equal(esSolido(partirGuion("{ game_spawn\n\tsetsolid trigger\n}\n")), false);
    assert.equal(esSolido(partirGuion("{ game_spawn\n\tsetsolid none\n}\n")), false);
    assert.equal(esSolido(partirGuion("{ game_spawn\n\tname X\n}\n")), true);
  });
});

// ── EL MONTAJE COMÚN: como `src/main.js`, sin Three ni Rapier ───────────────

const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 15, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "spin_horizontal_norm", fps: 30, fotogramas: 30, bucle: true, actividad: 0, pesoActividad: 1, avance: [0, 0, 0] },
];

/**
 * `colocados`: `[{ script, ficha, enU:[x,y,z], relacion }]`, en unidades del
 * motor. `creables`: `{ script: ficha }`. El jugador, en `jugadorEnU`.
 */
function montar({ colocados = [], creables = {}, jugadorEnU = [0, 0, 0], habilidades = {}, mana = 100, conMundo = true, pared = null } = {}) {
  const guiones = {};
  for (const s of [...colocados.map((c) => c.script), ...Object.keys(creables)]) guiones[s] = cargar(s);
  const manada = new Manada({
    mapa: "liso", unidadesPorMetro: U, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: colocados.map((c) => ({
      clase: "ms_npc", script: c.script, clave: "b",
      nombre: c.ficha.nombre ?? c.script, hp: c.hp ?? c.ficha.hp ?? 10, ancho: c.ficha.ancho, alto: c.ficha.alto,
      parado: "idle1", andando: "walk", piel: 0,
      escena: aEscena(c.enU, U), yaw: 0, luz: [0, 0, 0],
      hostil: (c.relacion ?? RELACION.NEUTRAL) <= RELACION.DESPRECIO, relacion: c.relacion ?? RELACION.NEUTRAL,
      ia: c.ficha.ia ? { ...c.ficha.ia, ...(c.hp ? { vida: c.hp } : {}) } : null,
    })),
  }, {
    secuenciasPorClave: new Map([["b", SECUENCIAS]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 32] }]]),
    azar: () => 0.5,
  });
  const personaje = { id: "P1", nombre: "Ana", vida: 50, mana, habilidades };
  const reloj = { t: 10 };
  const sucesos = [];
  const inter = new InteraccionesNpc({
    sesion: { personaje },
    guiones: { guiones },
    npcPorId: (id) => manada.de(id),
    suceso: (t, x) => sucesos.push(`${t}: ${x}`),
    losNpc: () => manada.instancias,
    dondeEstaElJugador: () => aEscena(jugadorEnU, U),
    unidadesPorMetro: U,
  });
  inter.enchufarA(manada);
  const golpes = [], curas = [];
  const mundo = new MundoDeCreados({
    unidadesPorMetro: U,
    ahora: () => reloj.t,
    entidades: inter.registroDeEntidades,
    instancias: () => manada.instancias,
    fichaDe: (script) => (guiones[script] && creables[script] ? { ...creables[script], script, clave: "b", parado: creables[script].parado ?? "idle1" } : null),
    crearInstancia: (ficha, donde) => manada.crear(ficha, donde),
    guionDe: (i) => inter.guionDe(i),
    guionSiHay: (i) => inter.guionesVivos.get(i.id) ?? null,
    retirarGuion: (i) => inter.guionesVivos.get(i.id)?.retirar?.(),
    jugador: () => ({ ref: inter.contextoDelJugador().ref, personaje, pies: aEscena(jugadorEnU, U), yaw: 0, vivo: true }),
    herir: (i, dano, o) => { golpes.push({ id: i.id, dano, habilidad: o.habilidad, tipo: o.tipo }); i.vida = Math.max(0, (i.vida ?? 0) - dano); return {}; },
    curar: (que, n) => curas.push({ que, n }),
    trazar: (a, b) => pared?.(a, b) ?? null,
    azar: () => 0.5,
  });
  if (conMundo) inter.creados = mundo;
  const objetos = [];
  const correr = (segundos, hasta = null) => {
    const DT = 1 / 60;
    for (let t = 0; t < segundos; t += DT) {
      reloj.t += DT;
      mundo.paso(DT);
      inter.paso(DT);
      for (const o of objetos) o.paso(DT);
      if (hasta?.()) return true;
    }
    return false;
  };
  return { manada, inter, mundo, personaje, reloj, sucesos, golpes, curas, correr, objetos, guiones };
}

// ── 2. EL SEGUNDO CASO: un guion nuestro que crea otro ──────────────────────

describe("createnpc: un guion del mapa crea un monstruo (contenido/scripts/pruebas)", { skip: !HAY_MOD }, () => {
  const fichaRata = () => modeloYAnimaciones(leerFichaNpc(SCRIPTS, "monsters/giantrat"));
  const escena = (opciones = {}) => {
    const m = montar({
      colocados: [{ script: "pruebas/oleada", ficha: { nombre: "Wave Caller", hp: 50, ancho: 32, alto: 72, ia: null }, enU: [0, 0, 0] }],
      creables: { "pruebas/cria": fichaRata() },
      ...opciones,
    });
    const jefe = m.manada.instancias[0];
    return { ...m, jefe, g: m.inter.guionDe(jefe) };
  };

  test("los dos guiones de prueba se parten y el de la oleada tiene su `createnpc`", () => {
    const g = cargar("pruebas/oleada");
    assert.ok(g.eventos.some((e) => e.nombre === "llamar_oleada"));
    const lector = (r) => leer(r);
    assert.ok(creadosPor("pruebas/oleada", lector).usos >= 2);
  });

  test("crea una instancia NUEVA en la manada, en el punto pedido y sin mover a las demás", () => {
    const { manada, g, jefe, mundo } = escena();
    const antes = manada.n;
    const dondeJefe = [...jefe.donde];
    g.guion.llamar("llamar_oleada", ["pruebas/cria", "(100,200,24)", "alfa"]);
    assert.equal(manada.n, antes + 1, "una instancia más");
    const cria = manada.instancias[antes];
    assert.equal(cria.id, antes, "al final de la lista: el id de las demás no se mueve");
    assert.equal(manada.instancias[0], jefe);
    assert.deepEqual(jefe.donde, dondeJefe);
    assert.equal(cria.ficha.script, "pruebas/cria");
    // `pev->origin = Position` (scriptcmds.cpp:2781), en el punto y no en el suelo.
    const o = aMotor(cria.donde, U);
    assert.ok(Math.abs(o[0] - 100) < 1e-6 && Math.abs(o[1] - 200) < 1e-6 && Math.abs(o[2] - 24) < 1e-6, JSON.stringify(o));
    assert.equal(cria.dormido, false);
    assert.equal(mundo.cuenta.creados, 1);
  });

  test("lo creado es un monstruo de verdad: ficha de combate, cazador y guion con el cierre del 91", () => {
    const { manada, g, inter } = escena();
    g.guion.llamar("llamar_oleada", ["pruebas/cria", "(100,200,0)", "alfa"]);
    const cria = manada.instancias[1];
    assert.ok(esDeCombate(cria), "la rata hace daño");
    assert.ok(cria.cazador, "y caza");
    assert.ok(cria.vida > 0);
    const gc = inter.guionesVivos.get(cria.id);
    assert.ok(gc, "su guion nació con ella, sin esperar a `nacerBichos`");
    assert.ok(gc.cierre.size > 0, "con el cierre de un bicho de combate");
    assert.equal(cria.vuelo.vuela, false, "y no vuela: la mueve la IA de siempre");
  });

  test("`game_dynamically_created` recibe los parámetros de detrás del origen, en orden (:2802-2808)", () => {
    const { manada, g, inter } = escena();
    g.guion.llamar("llamar_oleada", ["pruebas/cria", "(100,200,0)", "alfa"]);
    const gc = inter.guionesVivos.get(manada.instancias[1].id);
    assert.equal(gc.guion.vars.get("MI_ETIQUETA"), "alfa");
    assert.equal(gc.guion.vars.get("MI_NUMERO"), "0");
    assert.equal(gc.guion.vars.get("MI_TIPO"), "oleada");
    assert.equal(manada.instancias[1].creado.recibio, true);
  });

  test("`ent_lastcreated` es el asa de ESA instancia, y la segunda cría tiene otra", () => {
    const { manada, g, mundo } = escena();
    g.guion.llamar("llamar_oleada", ["pruebas/cria", "(100,200,0)", "alfa"]);
    const a1 = g.guion.vars.get("ULTIMA_CRIA");
    assert.match(a1, /^PentP\(\d+,\d+\)$/);
    assert.equal(mundo.entidades.recuperar(a1).que, manada.instancias[1]);
    g.guion.llamar("llamar_oleada", ["pruebas/cria", "(-100,0,0)", "beta"]);
    const a2 = g.guion.vars.get("ULTIMA_CRIA");
    assert.notEqual(a2, a1);
    assert.equal(mundo.entidades.recuperar(a2).que, manada.instancias[2]);
    assert.equal(Number(g.guion.vars.get("CRIAS_HECHAS")), 2);
  });

  test("lo creado le habla a su creador por `ent_creationowner` (:2796)", () => {
    const { g } = escena();
    g.guion.llamar("llamar_oleada", ["pruebas/cria", "(100,200,0)", "alfa"]);
    assert.equal(g.guion.vars.get("CRIA_ETIQUETA"), "alfa");
    g.guion.llamar("llamar_oleada", ["pruebas/cria", "(100,200,0)", "beta"]);
    assert.equal(g.guion.vars.get("CRIA_ETIQUETA"), "beta");
    assert.equal(Number(g.guion.vars.get("CRIA_NUMERO")), 1);
  });

  test("un guion que NO está horneado no crea nada, y se dice cuál falta", () => {
    const { manada, g, mundo } = escena();
    g.guion.llamar("llamar_oleada", ["monsters/no_horneado", "(0,0,0)", "x"]);
    assert.equal(manada.n, 1);
    assert.equal(mundo.cuenta.sinFicha, 1);
    assert.deepEqual(mundo.faltan, ["monsters/no_horneado"]);
    assert.equal(g.guion.vars.get("ULTIMA_CRIA"), "0");
  });

  test("con un solo parámetro no crea nada y `ent_lastcreated` sigue siendo la anterior", () => {
    const { manada, g } = escena();
    g.guion.llamar("llamar_oleada", ["pruebas/cria", "(100,200,0)", "alfa"]);
    const antes = g.guion.vars.get("ULTIMA_CRIA");
    g.guion.llamar("llamar_mal", ["pruebas/cria"]);
    assert.equal(manada.n, 2);
    assert.equal(g.guion.vars.get("TRAS_MAL"), antes);
  });

  test("SIN mundo de lo creado (como en el servidor), el guion del mapa lo apunta y no crea", () => {
    const { manada, g } = escena({ conMundo: false });
    g.guion.llamar("llamar_oleada", ["pruebas/cria", "(100,200,0)", "alfa"]);
    assert.equal(manada.n, 1);
    assert.ok(g.guion.noSoportados.some((x) => x.tipo === "comando" && x.nombre === "createnpc"));
  });
});

// ── 3. LA BLOOD DRINKER, con los guiones del mod ────────────────────────────

describe("createnpc: el lanzamiento de la Blood Drinker (guiones del mod)", { skip: !HAY_MOD }, () => {
  const INVOCACION = "monsters/summon/blood_drinker";
  const ARMA = "swords_blood_drinker";
  const HAB = { spellcasting: { fire: { valor: 20 }, ice: { valor: 20 }, lightning: { valor: 20 }, divination: { valor: 20 }, affliction: { valor: 20 } } };

  /** El arma en la mano, con su guion vivo y el mundo que le da `src/main.js`. */
  function escena({ enemigoEnU = [300, 0, 0], relacion = RELACION.ODIO, mana = 100, habilidades = HAB, apuntado = true, pared = null } = {}) {
    /** Dónde está el jugador, en unidades. Es un array vivo: la prueba lo mueve. */
    const jugadorEnU = [0, 0, 0];
    const fichaEnemigo = { nombre: "Dummy", hp: 5000, ancho: 32, alto: 72, ia: { raza: "orc", dano: 1, ancho: 32, alto: 72, vida: 5000 } };
    const m = montar({
      colocados: [{ script: "pruebas/oleada", ficha: fichaEnemigo, hp: 5000, enU: enemigoEnU, relacion }],
      creables: { [INVOCACION]: modeloYAnimaciones(leerFichaNpc(SCRIPTS, INVOCACION)) },
      jugadorEnU, habilidades, mana, pared,
    });
    const enemigo = m.manada.instancias[0];
    // El enemigo no caza: su `cazador` se queda, pero aquí nadie llama a `cazar`.
    const tabla = new Proxy({}, { get: (_t, ruta) => (typeof ruta === "string" ? leer(ruta) : undefined) });
    const dichos = [];
    const jugador = { personaje: m.personaje, llamar: () => false, recibir: () => {} };
    const arma = new GuionDeObjeto({
      guiones: new GuionesDeObjeto({ objetos: { [ARMA]: { ruta: `items/${ARMA}` } }, archivos: tabla }),
      id: ARMA, jugador, ahora: () => m.reloj.t,
      suceso: (tipo, texto) => dichos.push(`${tipo}: ${texto}`),
      mundo: {
        crearNpc: (script, origen, params, o) => m.mundo.crear(script, origen, params, o),
        asaDeObjeto: (o) => m.mundo.asaDeObjeto(o),
        asaDelDueño: () => m.inter.contextoDelJugador().ref,
        origenDelDueño: () => [jugadorEnU[0], jugadorEnU[1], jugadorEnU[2] + 36],
        objetivoDelDueño: () => (apuntado ? m.mundo.asaDe(enemigo) : "0"),
        llamarA: (asa, evento, params) => {
          const e = m.inter.registroDeEntidades.recuperar(asa);
          const g = e?.que?.ficha ? m.inter.guionesVivos.get(e.que.id) ?? null : null;
          if (!g?.guion) return false;
          g.guion.llamar(evento, params);
          return true;
        },
      },
    });
    arma.arrancar({ genero: "male" });
    m.objetos.push(arma);
    const lanzar = () => {
      arma.llamar("throwsword_start", []);
      arma.llamar("throwsword_strike", ["none", "(0.00,0.00,36.00)", "¯NONE¯", "0"]);
      return m.mundo.vivos[0] ?? null;
    };
    const distancia = (i) => {
      const a = aMotor(i.donde, U), b = aMotor(enemigo.donde, U);
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    };
    return { ...m, arma, enemigo, lanzar, dichos, distancia, jugadorEnU };
  }

  test("es la única arma con el guion del ataque encendido, y su guion crea esa invocación", () => {
    assert.deepEqual([...ARMAS_QUE_INVOCAN], [ARMA]);
    const r = creadosPor(`items/${ARMA}`, lectorDe(SCRIPTS));
    assert.deepEqual([...r.rutas], [INVOCACION]);
    assert.ok(creablesDe([{ ruta: `items/${ARMA}`, de: "arma" }], SCRIPTS).creables.has(INVOCACION));
  });

  test("el guion del arma, vivo: al nacer la espada se ve (`vista` sin tocar o con su modelo)", () => {
    const { arma } = escena();
    assert.ok(arma.hay, "el guion del arma se resolvió");
    assert.notEqual(arma.vista, null, "y no nace con la mano vacía");
  });

  test("`throwsword_start` vacía la mano y `throwsword_strike` crea la invocación en la manada", () => {
    const { arma, manada, mundo, lanzar } = escena();
    const antes = manada.n;
    arma.llamar("throwsword_start", []);
    assert.equal(arma.vista, null, "`setviewmodel none` (swords_blood_drinker.script:149)");
    assert.equal(mundo.vivos.length, 0, "todavía no hay nada: se crea al CAER el ataque");
    const inv = lanzar();
    assert.ok(inv, "hay una entidad nueva");
    assert.equal(manada.n, antes + 1);
    assert.equal(inv.ficha.script, INVOCACION);
    // Nace en el `origin` del dueño: `$get(ent_owner,origin)` (:171), su centro.
    const o = aMotor(inv.donde, U);
    assert.ok(Math.abs(o[0]) < 1e-6 && Math.abs(o[1]) < 1e-6 && Math.abs(o[2] - 36) < 1e-6, JSON.stringify(o));
    // Y el arma se queda con su asa: `setvard SWORD_ID $get(ent_lastcreated,id)` (:172).
    assert.equal(arma.guion.vars.get("SWORD_ID"), inv.asa);
  });

  test("su `game_spawn` la hace volar y tocar, y `game_dynamically_created` le da dueño, objetivo, daño y duración", () => {
    const { lanzar, inter, personaje, mundo, enemigo, arma } = escena();
    const inv = lanzar();
    const g = inter.guionesVivos.get(inv.id);
    assert.equal(inv.vuelo.vuela, true, "`fly 1` (blood_drinker.script:67)");
    assert.equal(inv.creado.tocar, true, "`setcallback touch enable` (:25)");
    assert.equal(inv.raza, "human", "`race $get(MY_OWNER,race)` (:49)");
    assert.equal(g.guion.vars.get("MY_OWNER"), personaje.id, "PARAM1: el asa del jugador, no «ent_owner»");
    assert.equal(g.guion.vars.get("FIRST_TARGET"), mundo.asaDe(enemigo), "PARAM2: a quién miraba el jugador");
    // PARAM3 y PARAM4: `skill.spellcasting / 2` (swords_blood_drinker.script:169-171).
    const mitad = Math.trunc(valorDeHabilidad(HAB.spellcasting)) / 2;
    assert.equal(mitad, 10, "con spellcasting 20 son 10: la mitad, a mano");
    assert.equal(Number(g.guion.vars.get("DMG_BASE")), 10);
    assert.equal(Number(g.guion.vars.get("BLADE_DURATION")), 10);
    assert.equal(g.guion.vars.get("RETURN_ID"), arma.asa, "PARAM5: el asa del arma, para `sword_return`");
    assert.equal(g.guion.vars.get("OWNER_ISPLAYER"), "1");
  });

  test("EL FALLO DEL MOD: con el objetivo vivo NO vuela hacia él — `$relvel(0,FWD_SPEED,0)` con una variable vale (0,0,0)", () => {
    // `StringToVec(&FullName.c_str()[7])` lee el TEXTO, no el parámetro resuelto
    // (script.cpp:3614), y «(0,FWD_SPEED,0)» no casa con «(%f,%f,%f)»
    // (sharedutil.cpp:115-124). Lo que la mueve es `setanim.movespeed 1`: 1 u/s.
    const { lanzar, correr, distancia, inter } = escena();
    const inv = lanzar();
    const g = inter.guionesVivos.get(inv.id);
    assert.equal(g.guion.resolver("$relvel(0,FWD_SPEED,0)"), "(0.00,0.00,0.00)");
    assert.equal(Number(g.guion.vars.get("FWD_SPEED")), 20, "y la variable SÍ vale 20: no es que falte");
    const d0 = distancia(inv);
    correr(3);
    const andado = d0 - distancia(inv);
    // A 1 u/s en 3 s son 3 unidades. Si el teletransporte funcionara serían
    // 20 u por décima: 600. Los dos lados del número, a mano.
    assert.ok(andado > 1.5 && andado < 4.5, `se arrastra a 1 u/s: ${andado.toFixed(2)} u en 3 s`);
    assert.equal(inv.vuelo.suelo, 1, "`setanim.movespeed NPC_HACKED_MOVE_SPEED` (base_propelled.script:20)");
    assert.equal(inv.vuelo.conDestino, true, "y encara a su destino (`setmovedest`)");
  });

  test("al que se mete en su caja le pega con el daño del guion, a nombre del jugador, y le roba vida", () => {
    // El enemigo, a 40 u: su caja (32 de ancho) solapa con la de la espada (64).
    const { lanzar, correr, golpes, curas, enemigo, mundo } = escena({ enemigoEnU: [40, 0, 0] });
    lanzar();
    correr(1, () => golpes.length >= 2);
    assert.ok(mundo.cuenta.toques > 0, "hubo `game_touch`");
    assert.ok(golpes.length >= 2, `golpes: ${golpes.length}`);
    // `xdodamage PARAM1 direct DMG_BASE 100% MY_OWNER ent_me MY_SKILL dark` (:98).
    assert.deepEqual(golpes[0], { id: enemigo.id, dano: 10, habilidad: "swordsmanship", tipo: "dark" });
    // `givehp MY_OWNER 4.0` (:117).
    assert.deepEqual(curas[0], { que: "vida", n: 4 });
  });

  test("como mucho un toque por décima: `NEXT_TOUCH` (:93-95)", () => {
    const { lanzar, correr, golpes } = escena({ enemigoEnU: [40, 0, 0] });
    lanzar();
    correr(2);
    // En 2 s caben 20 décimas; a 60 pasos por segundo el primero que cumple
    // `game.time > NEXT_TOUCH` llega cada 7 pasos (0,117 s): unos 17. Ni los
    // 120 de «un toque por paso» ni los 10 de «un toque cada dos décimas», que
    // es lo que daba mirando el toque sólo en el `Think`.
    assert.ok(golpes.length >= 15 && golpes.length <= 20, `golpes en 2 s: ${golpes.length}`);
  });

  test("al que está fuera de su caja NO le toca (control negativo del solape)", () => {
    const { lanzar, correr, golpes, mundo } = escena({ enemigoEnU: [120, 0, 0] });
    lanzar();
    correr(2);
    assert.equal(mundo.cuenta.toques, 0);
    assert.equal(golpes.length, 0);
  });

  test("a un bicho que NO es enemigo lo toca y NO le pega (`relationship equals enemy`, :97)", () => {
    const { lanzar, correr, golpes, mundo } = escena({ enemigoEnU: [40, 0, 0], relacion: RELACION.RECELO });
    lanzar();
    correr(1, () => mundo.cuenta.toques >= 3);
    assert.ok(mundo.cuenta.toques >= 3, `toques: ${mundo.cuenta.toques}`);
    assert.equal(golpes.length, 0);
  });

  test("mientras la invocación existe la mano está VACÍA, y la espada vuelve cuando lo dice su guion", () => {
    const { arma, lanzar, correr, mundo, reloj, inter } = escena();
    const t0 = reloj.t;
    const inv = lanzar();
    // A los 0,2 s —el fin del ataque, el andamio de antes— sigue fuera.
    correr(0.5);
    assert.equal(arma.vista, null, "medio segundo después sigue sin espada");
    assert.equal(mundo.vivos.length, 1);
    const g = inter.guionesVivos.get(inv.id);
    let vacia = true;
    const volvio = correr(40, () => {
      // `IS_ACTIVE` lo baja `notify_return` JUSTO al llamar a `sword_return`
      // (:303-312); la entidad se borra una décima después (`callevent 0.1
      // remove_me`). Mientras está activa, la mano no puede tener espada.
      if (g.guion.vars.get("IS_ACTIVE") === "1" && arma.vista !== null) vacia = false;
      return arma.vista !== null;
    });
    assert.ok(volvio, "en 40 s tenía que volver");
    assert.ok(vacia, "con la invocación ACTIVA la mano no se llenó");
    // `callevent BLADE_DURATION return_to_owner` (blood_drinker.script:53): 10 s,
    // y el dueño no se ha movido: está a menos de `OWNER_HEIGHT` (:156-159).
    const tardo = reloj.t - t0;
    assert.ok(tardo >= 10, `vuelve a los ${tardo.toFixed(2)} s, no antes de los 10 de su duración`);
    assert.ok(tardo < 11, `y en cuanto acaba: ${tardo.toFixed(2)} s`);
    // `sword_return` (swords_blood_drinker.script:209-218).
    assert.equal(arma.vista, "viewmodels/v_2hswords.mdl");
    assert.equal(arma.guion.vars.get("FIST_MODE"), "0");
    // Y la invocación se borra: `callevent 0.1 remove_me` -> `deleteent ent_me` (:313-319).
    correr(0.5);
    assert.equal(mundo.vivos.length, 0);
    assert.equal(inv.dormido, true);
    assert.equal(mundo.cuenta.borrados, 1);
    assert.equal(inter.guionesVivos.get(inv.id).retirado, true, "y su guion deja de correr");
  });

  test("el botón derecho la llama de vuelta antes de tiempo (`game_+attack2`, :192-200)", () => {
    const { arma, lanzar, correr, reloj, mundo } = escena();
    const t0 = reloj.t;
    lanzar();
    correr(1);
    assert.equal(arma.vista, null, "al segundo la espada está fuera");
    assert.equal(mundo.vivos.length, 1);
    arma.llamar("game_+attack2", []);
    const volvio = correr(8, () => arma.vista !== null);
    assert.ok(volvio, "vuelve");
    assert.ok(reloj.t - t0 < 2, `en la décima siguiente, no a los 10 s: ${(reloj.t - t0).toFixed(2)} s`);
  });

  test("EL FALLO DEL MOD: si el dueño se ha ido a más de 72 u, la espada NO vuelve hasta que se acerca", () => {
    // Al volver no avanza (el mismo `$relvel` a cero), así que sólo «llega» si
    // el dueño está a menos de `OWNER_HEIGHT` (blood_drinker.script:156-159).
    const { arma, lanzar, correr, jugadorEnU, mundo } = escena();
    lanzar();
    correr(1);
    jugadorEnU[0] = -400;                       // el dueño se aleja
    correr(15);
    assert.equal(arma.vista, null, "pasada su duración y con el dueño lejos, sigue fuera");
    assert.equal(mundo.vivos.length, 1);
    jugadorEnU[0] = 0;                          // y vuelve a su lado
    assert.ok(correr(1, () => arma.vista !== null), "al acercarse el dueño, vuelve");
  });

  test("sin nadie a quien mirar SÍ se mueve: a 100 u/s hasta delante del dueño (`setvelocity`, :145-150)", () => {
    const { lanzar, correr, mundo } = escena({ apuntado: false, enemigoEnU: [5000, 5000, 0] });
    const inv = lanzar();
    assert.ok(inv);
    correr(3);
    // «hover in front of and above owner»: 128 adelante y 64 arriba del
    // `origin` del dueño (:262-264), que mira a +X y tiene el centro a 36.
    const o = aMotor(inv.donde, U);
    assert.ok(Math.hypot(o[0] - 128, o[1], o[2] - 100) < 25, `ronda el punto (128,0,100): ${JSON.stringify(o.map(Math.round))}`);
    assert.equal(mundo.vivos.length, 1);
  });

  test("y esa velocidad se PARA contra el mundo (`SV_Physics_Toss`)", () => {
    // Una pared en x = 60: la espada no llega a su punto de delante.
    const pared = (a, b) => (a[0] < 60 && b[0] >= 60 ? [59, a[1], a[2]] : null);
    const { lanzar, correr, mundo } = escena({ apuntado: false, enemigoEnU: [5000, 5000, 0], pared });
    const inv = lanzar();
    correr(3);
    const o = aMotor(inv.donde, U);
    assert.ok(o[0] <= 60, `no pasa de la pared: x = ${o[0].toFixed(1)}`);
    assert.ok(o[0] > 40, `pero llega hasta ella: x = ${o[0].toFixed(1)}`);
    assert.ok((mundo.cuenta.choques ?? 0) > 0);
  });

  test("sin maná para el baile, el guion devuelve la espada en el acto y lo dice (:156-162)", () => {
    const { arma, dichos, mundo } = escena({ mana: 10 });
    arma.llamar("throwsword_start", []);
    assert.equal(arma.vista, "viewmodels/v_2hswords.mdl", "`sword_return` la devuelve");
    assert.ok(dichos.some((d) => d.includes("Insufficient mana for Blood Dance")), JSON.stringify(dichos));
    // Y el `_strike` que el motor ya no llamaría, aunque llegara, no crea nada: `if FIST_MODE`.
    arma.llamar("throwsword_strike", ["none", "(0,0,36)", "¯NONE¯", "0"]);
    assert.equal(mundo.vivos.length, 0);
  });
});
