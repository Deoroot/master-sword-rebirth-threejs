// LAS TRANSICIONES ENTRE MAPAS — experimento 89. Ver src/play/transicion.js.
//
// Dos clases de prueba, y van separadas a propósito:
//
//   - las de la REGLA, con los textos del juego escritos a mano y su cita al
//     lado: cuando el número ES la regla, no se lee de la misma constante que
//     se mide (el 75);
//   - las del HORNEADO, que meten por el módulo las zonas y las llegadas de
//     verdad de Edana y de las cloacas. Ahí no se construye nada a mano —el 59
//     y el 63—: si el horneado trajera mal una clave, lo verían éstas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  Transiciones, elegirLlegada, inicioDe, noExiste, anuncioDeViaje, faltaElEnlace, ESPERA_DEL_VIAJE,
} from "../src/play/transicion.js";
import { MAPAS_PORTADOS } from "../src/play/mapa.js";

const existe = (m) => MAPAS_PORTADOS.includes(m);
const tipos = (efs) => efs.map((e) => e.tipo === "evento" ? `evento:${e.nombre}` : e.tipo);

// ── LA REGLA ────────────────────────────────────────────────────────────────

test("los textos son los del juego, escritos a mano con su cita", () => {
  // map_transitions.script:15 — `L_MAP` es el `destmap` crudo, no el nombre bonito.
  assert.equal(noExiste("thornlands"),
    "thornlands does not exist on this server. Perhaps this is a future transition point?");
  // msmapents.cpp:1833
  assert.equal(anuncioDeViaje("The Edana Sewers"), "Traveling to The Edana Sewers");
  // player.cpp:2530
  assert.equal(faltaElEnlace("sewer_start"), "* Mapper did not include transition link: sewer_start *");
  // map_transitions.script:73, `callevent 5.0 delay_changelevel`
  assert.equal(ESPERA_DEL_VIAJE, 5.0);
});

test("sin transición, Enter no hace nada aquí", () => {
  assert.deepEqual(new Transiciones({ mapaExiste: existe }).aceptar(), []);
});

test("un maestro cerrado no deja entrar (msmapents.cpp:1652-1664)", () => {
  const t = new Transiciones({ mapaExiste: existe });
  const z = { clase: "msarea_transition", nombre: "x", destino: "edana", comoSeLlama: "Edana", llegada: "y", maestro: "puerta" };
  assert.deepEqual(t.tic([z], { maestroAbierto: () => false }), []);
  assert.equal(t.actual, null);
  // Y el control positivo: el mismo con el maestro abierto sí entra.
  assert.deepEqual(tipos(t.tic([z], { maestroAbierto: () => true })), ["guardar", "evento:game_transition_entered"]);
});

// ── CON LO HORNEADO ─────────────────────────────────────────────────────────

const RUTAS = { edana: "build/edana/malla.json", cloacas: "build/edanasewers/malla.json" };
const hay = existsSync(RUTAS.edana) && existsSync(RUTAS.cloacas);
const salta = { skip: hay ? false : "faltan build/edana o build/edanasewers: `npm run mapa -- --mapa <m>`" };
const leer = (r) => JSON.parse(readFileSync(r, "utf8"));
const zonasDe = (m) => m.interactivas.zonas.filter((z) => z.clase === "msarea_transition");

test("el horneado trae las cuatro claves del motor en las cuatro transiciones", salta, () => {
  for (const r of Object.values(RUTAS)) {
    const zs = zonasDe(leer(r));
    assert.equal(zs.length, 2, r);
    for (const z of zs) {
      for (const k of ["nombre", "destino", "comoSeLlama", "llegada"]) assert.ok(z[k], `${r}: ${z.nombre} sin ${k}`);
    }
  }
});

test("pisar la cloaca de Edana: guarda y luego `game_transition_entered`, con los 4 parámetros en el orden del motor", salta, () => {
  const z = zonasDe(leer(RUTAS.edana)).find((x) => x.nombre === "sewer_entrance");
  const t = new Transiciones({ mapaExiste: existe });
  const efs = t.tic([z]);
  assert.deepEqual(tipos(efs), ["guardar", "evento:game_transition_entered"]);
  // msmapents.cpp:1714-1718: destname, destmap, sName, sDestTrans
  assert.deepEqual(efs[1].params, ["The Edana Sewers", "edanasewers", "sewer_entrance", "sewer_start"]);
});

test("la guarda es de UNA vez: quedarse dentro cien tics dispara una sola entrada", salta, () => {
  const z = zonasDe(leer(RUTAS.edana)).find((x) => x.nombre === "sewer_entrance");
  const t = new Transiciones({ mapaExiste: existe });
  let entradas = 0;
  for (let i = 0; i < 100; i++) entradas += t.tic([z]).filter((e) => e.nombre === "game_transition_entered").length;
  assert.equal(entradas, 1);
});

test("salir da `game_transition_exited` con TRES parámetros, y volver a entrar vuelve a disparar", salta, () => {
  const z = zonasDe(leer(RUTAS.edana)).find((x) => x.nombre === "sewer_entrance");
  const t = new Transiciones({ mapaExiste: existe });
  t.tic([z]);
  const fuera = t.tic([]);
  assert.deepEqual(tipos(fuera), ["evento:game_transition_exited"]);
  assert.deepEqual(fuera[0].params, ["The Edana Sewers", "edanasewers", "sewer_entrance"]);   // :1763-1766
  assert.deepEqual(tipos(t.tic([z])), ["guardar", "evento:game_transition_entered"]);
});

test("Thornlands NO está: el aviso verde Y el «Traveling to» del C++, sin bloquear ni viajar", salta, () => {
  const z = zonasDe(leer(RUTAS.edana)).find((x) => x.nombre === "a3trans");
  assert.equal(existe("thornlands"), false, "el control depende de que Thornlands NO esté portado");
  const t = new Transiciones({ mapaExiste: existe });
  t.tic([z]);
  const efs = t.aceptar();
  assert.deepEqual(tipos(efs), ["mensaje", "centro", "evento:game_map_change", "guardar"]);
  assert.equal(efs[0].color, "green");
  assert.equal(efs[0].texto, "thornlands does not exist on this server. Perhaps this is a future transition point?");
  assert.equal(efs[1].texto, "Traveling to The Thornlands");
  // Y la segunda pulsación no repite nada: el `game_master` ya se llamó y el
  // voto ya está puesto.
  assert.deepEqual(t.aceptar(), []);
});

test("las cloacas SÍ están: avisa, viaja a los 5 s con la llegada, bloquea y guarda", salta, () => {
  const z = zonasDe(leer(RUTAS.edana)).find((x) => x.nombre === "sewer_entrance");
  const t = new Transiciones({ mapaExiste: existe });
  t.tic([z]);
  const efs = t.aceptar();
  assert.deepEqual(tipos(efs), ["aviso", "viajar", "centro", "bloquear", "evento:game_map_change", "guardar"]);
  assert.equal(efs[0].titulo, "TRAVELING TO edanasewers");
  assert.equal(efs[0].texto, "You will be reconnected shortly.");
  assert.deepEqual({ mapa: efs[1].mapa, llegada: efs[1].llegada, en: efs[1].en },
    { mapa: "edanasewers", llegada: "sewer_start", en: 5 });
  // `GM_DISABLE_TRANSITIONS`: la segunda vez no pasa nada, ni salir avisa.
  assert.deepEqual(t.aceptar(), []);
  assert.deepEqual(t.tic([]), []);
});

test("con más de un jugador el guion abre una votación, que NO está portada, y no se viaja", salta, () => {
  const z = zonasDe(leer(RUTAS.edana)).find((x) => x.nombre === "sewer_entrance");
  const t = new Transiciones({ mapaExiste: existe });
  t.tic([z]);
  const efs = t.aceptar({ jugadores: 2, todosDentro: true, todosVotaron: false, quien: "Ana" });
  assert.deepEqual(tipos(efs), ["votacion", "aviso"]);
  assert.equal(efs[1].texto, "Ana wants to go to The Edana Sewers");   // :1825-1828
  assert.ok(!efs.some((e) => e.tipo === "viajar"));
});

// ── LA LLEGADA, que es donde está el enlace roto ────────────────────────────

test("de las cloacas a Edana se llega: cinco llegadas `sewer_entrance` y se sortea entre ellas", salta, () => {
  const edana = leer(RUTAS.edana);
  const z = zonasDe(leer(RUTAS.cloacas)).find((x) => x.nombre === "sewer_start");
  assert.equal(z.llegada, "sewer_entrance");
  const vistas = new Set();
  for (let i = 0; i < 5; i++) {
    vistas.add(JSON.stringify(elegirLlegada(edana.llegadas, z.llegada, { inicio: inicioDe(edana), azar: () => i }).unidades));
  }
  assert.equal(vistas.size, 5, "el dado tiene que poder elegir cualquiera de las cinco");
  // Y ninguna de las cinco es el inicio: si lo fuera, el respaldo estaría
  // tapando la búsqueda por nombre y este control no la distinguiría.
  assert.ok(!vistas.has(JSON.stringify(inicioDe(edana).unidades)));
});

// CORRECCIÓN DEL 89: esta prueba se escribió primero como «de Edana a las
// cloacas NO se llega: el enlace roto del mapa», y estaba VERDE. Afirmaba un
// fallo del juego que no existe: el usuario enseñó el juego original llegando a
// las cloacas. Las cloacas tienen `ms_player_begin`, quien llega es `JN_STARTMAP`
// (mscharacter.cpp:216-217) y cae en el inicio (player.cpp:2491-2492). Medido en
// todo el juego: 29 de las 193 transiciones llegan así, y ninguna se queda sin
// respaldo. *Una prueba verde de un fallo del original es tan sospechosa como
// cualquier otra: el verde sólo dice que el código hace lo que yo creí.*
test("de Edana a las cloacas se llega AL INICIO: no hay `sewer_start`, y las cloacas dejan crear personaje (JN_STARTMAP)", salta, () => {
  const cloacas = leer(RUTAS.cloacas);
  const z = zonasDe(leer(RUTAS.edana)).find((x) => x.nombre === "sewer_entrance");
  assert.equal(z.llegada, "sewer_start");
  assert.equal(cloacas.entrada.clase, "ms_player_begin");
  const donde = elegirLlegada(cloacas.llegadas, z.llegada, { inicio: inicioDe(cloacas) });
  assert.deepEqual(donde.unidades, cloacas.entrada.unidades);
  // El control positivo, para que el inicio no sea el valor de reposo: la
  // llegada con nombre que las cloacas SÍ tienen se encuentra, y NO es el inicio.
  assert.equal(cloacas.llegadas.map((l) => l.nombre).join(","), "fromchapel");
  const capilla = elegirLlegada(cloacas.llegadas, "fromchapel", { inicio: inicioDe(cloacas) });
  assert.notDeepEqual(capilla.unidades, cloacas.entrada.unidades);
});

test("sin `ms_player_begin` en el destino (JN_TRAVEL) no hay respaldo — regla sin caso real en el juego", () => {
  // DECLARADO PENDIENTE como caso de verdad: ninguna de las 193 transiciones de
  // los 92 mapas lleva a un destino así, así que esto es la regla y nada más.
  assert.equal(elegirLlegada([{ nombre: "otra", unidades: [1, 2, 3] }], "sewer_start", { inicio: null }), null);
  assert.equal(inicioDe({ entrada: { clase: "ms_player_spawn", unidades: [0, 0, 0] } }), null);
});

test("la coincidencia es EXACTA, como `FStrEq` (player.cpp:2363-2367)", salta, () => {
  const edana = leer(RUTAS.edana);
  const sinRespaldo = { inicio: null };
  assert.ok(elegirLlegada(edana.llegadas, "sewer_entrance", sinRespaldo));
  assert.equal(elegirLlegada(edana.llegadas, "Sewer_Entrance", sinRespaldo), null);
  assert.equal(elegirLlegada(edana.llegadas, "", sinRespaldo), null);
});
