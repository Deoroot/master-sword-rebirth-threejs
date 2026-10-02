// EXPERIMENTO 77 · `ms_npcscript`: los cuatro tipos que el 67 dejó contados.
//
// Lo que esto NO mide: que Edrin se vea andar. Eso es `sondas/edana77.mjs`,
// porque esto no abre un navegador. Lo que sí mide, y una sonda no puede, son
// las décimas: el `nextthink` de 0,1 s y el `firedelay` de 4 s de
// `edrinstrict1` — el 75 ya avisó de que un `evaluate` no mide décimas, así que
// el reloj aquí lo avanza la prueba.
//
// Y el censo de los 81 mapas, que es lo que decide qué merece portarse: se
// CUENTA leyendo los `.bsp`, no se copia de un comentario (apartado 5 de
// CLAUDE.md).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Escenas, TIPO, mueve, proximidadDe, haLlegado, mismoDestino } from "../src/play/escena.js";
import { Manada } from "../src/play/manada.js";
import { Disparadores, USO } from "../src/play/disparadores.js";
import { leerBsp, leerEntidades } from "../src/bsp/lector.js";

const MAPAS = process.env.MSR_ASSETS ?? "../MSC/assets/msr";
const DIR_MAPAS = join(MAPAS, "maps");
const hayMapas = existsSync(DIR_MAPAS);

const RUTA_EDANA = "build/edana";
const hayEdana = existsSync(join(RUTA_EDANA, "malla.json")) && existsSync(join(RUTA_EDANA, "bichos.json"));
const malla = hayEdana ? JSON.parse(readFileSync(join(RUTA_EDANA, "malla.json"), "utf8")) : null;
const censo = hayEdana ? JSON.parse(readFileSync(join(RUTA_EDANA, "bichos.json"), "utf8")) : null;

const faltaEdana = { skip: hayEdana ? false : "falta build/edana: `npm run mapa -- --mapa edana`" };
const faltanMapas = { skip: hayMapas ? false : `falta ${DIR_MAPAS}` };

/** Los `ms_npcscript` del mapa horneado, por nombre. */
const npcscriptsDeEdana = () => (malla?.disparadores ?? [])
  .filter((d) => d.clase === "ms_npcscript" || d.clase === "mstrig_act");
const porNombre = (n) => npcscriptsDeEdana().find((d) => d.nombre === n) ?? null;

// ───────────────────────────────────────────────────────────────────────────
describe("77 · el censo de los cinco tipos, contado de los `.bsp`", () => {
  test("172 `ms_npcscript` en 30 mapas, y el tipo 0 es el más común", faltanMapas, () => {
    const porTipo = new Map();
    let mapas = 0;
    const deEdana = {};
    const deGateCity = {};
    for (const f of readdirSync(DIR_MAPAS).filter((n) => n.endsWith(".bsp"))) {
      let ents;
      // Hay `.bsp` del juego que este lector no abre; se saltan en vez de
      // tumbar el censo, y el total que sale es el de los que SÍ se leen.
      try { ents = leerEntidades(leerBsp(join(DIR_MAPAS, f))); } catch { continue; }
      const mios = ents.filter((e) => e.classname === "ms_npcscript" || e.classname === "mstrig_act");
      if (!mios.length) continue;
      mapas++;
      for (const e of mios) {
        const t = Number(e.type) || 0;
        porTipo.set(t, (porTipo.get(t) ?? 0) + 1);
        if (f === "edana.bsp") deEdana[t] = (deEdana[t] ?? 0) + 1;
        if (f === "gatecity.bsp") deGateCity[t] = (deGateCity[t] ?? 0) + 1;
      }
    }
    const total = [...porTipo.values()].reduce((a, b) => a + b, 0);
    assert.equal(total, 172, `salen ${total}`);
    assert.equal(mapas, 30);
    assert.deepEqual(Object.fromEntries([...porTipo].sort((a, b) => a[0] - b[0])),
      { 0: 98, 1: 15, 2: 47, 3: 10, 4: 2 });
    // La frase que justifica el experimento, comprobada y no escrita: el tipo
    // que faltaba es el que más hay.
    const masComun = [...porTipo].sort((a, b) => b[1] - a[1])[0][0];
    assert.equal(masComun, TIPO.MOVER);
    // Y los dos mapas portados, que es lo que explica que esto llevara diez
    // experimentos sin verse.
    assert.deepEqual(deEdana, { 0: 2, 2: 15, 4: 1 });
    assert.deepEqual(deGateCity, {}, "Gate City no tiene ninguno");
  });

  test("los que MUEVEN son 110 de los 172, y ninguno está en Gate City", faltanMapas, () => {
    // Se calcula de la misma lectura para que no haya dos censos que se puedan
    // contradecir.
    let mueven = 0, total = 0;
    for (const f of readdirSync(DIR_MAPAS).filter((n) => n.endsWith(".bsp"))) {
      let ents;
      try { ents = leerEntidades(leerBsp(join(DIR_MAPAS, f))); } catch { continue; }
      for (const e of ents) {
        if (e.classname !== "ms_npcscript" && e.classname !== "mstrig_act") continue;
        total++;
        if (mueve(e.type)) mueven++;
      }
    }
    assert.equal(total, 172);
    assert.equal(mueven, 110);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("77 · la regla, escrita a mano y con su cita", () => {
  test("`mueve` es cierto para el 0, el 3 y el 4, y falso para el 1 y el 2", () => {
    // Los cinco a mano: el `enum` de npcact.cpp:17-23 no se deduce de nada.
    assert.equal(mueve(0), true);    // SCRIPT_MOVE
    assert.equal(mueve(1), false);   // SCRIPT_PLAYANIM
    assert.equal(mueve(2), false);   // SCRIPT_RUNEVENT
    assert.equal(mueve(3), true);    // SCRIPT_MOVE_PLAYANIM
    assert.equal(mueve(4), true);    // SCRIPT_MOVE_RUNEVENT
    // Un `type` que el mapa no pone es 0, que es MOVER y no «nada».
    assert.equal(mueve(undefined), true);
  });

  test("la proximidad es `m_Width * 1.1`, con el número escrito", () => {
    // `GetDefaultMoveProximity() { return m_Width * 1.1; }` — msmonster.h:355.
    // El 32 es el ancho de Edrin y el 35,2 es lo que tiene que salir: el
    // número va a mano porque ES la regla (la lección del 75).
    assert.equal(proximidadDe(32), 35.2);
    assert.equal(proximidadDe(0), null);
    assert.equal(proximidadDe("x"), null);
  });

  test("`haLlegado` tira la ALTURA para quien anda y no para quien vuela", () => {
    const ojo = [0, 0, 0];
    // Diez unidades justo encima: para quien anda, distancia cero.
    assert.equal(haLlegado({ destino: [0, 10, 0], ojo, proximidad: 1 }), true);
    // Y para quien vuela, diez.
    assert.equal(haLlegado({ destino: [0, 10, 0], ojo, proximidad: 1, vuela: true }), false);
    assert.equal(haLlegado({ destino: [0, 10, 0], ojo, proximidad: 10, vuela: true }), true);
  });

  test("el `<=` es `<=`: estar justo a la proximidad ya es haber llegado", () => {
    const ojo = [0, 0, 0];
    assert.equal(haLlegado({ destino: [35.2, 0, 0], ojo, proximidad: 35.2 }), true);
    // Y el positivo del otro lado, que es lo que hace que esto mida algo.
    assert.equal(haLlegado({ destino: [35.3, 0, 0], ojo, proximidad: 35.2 }), false);
  });

  test("`mismoDestino` compara el punto Y la proximidad (msmonster.h:21)", () => {
    const a = { origen: [1, 2, 3], proximidad: 35.2 };
    assert.equal(mismoDestino(a, { origen: [1, 2, 3], proximidad: 35.2 }), true);
    assert.equal(mismoDestino(a, { origen: [1, 2, 4], proximidad: 35.2 }), false);
    // ÉSTE es el que importa: el mismo punto con otra proximidad es OTRO
    // destino, y por eso el `setmovedest HOME_LOC 5` del guion de Edrin corta
    // la escena del mapa aunque fuese al mismísimo sitio.
    assert.equal(mismoDestino(a, { origen: [1, 2, 3], proximidad: 5 }), false);
    assert.equal(mismoDestino(null, null), true);
    assert.equal(mismoDestino(a, null), false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Un mundo de mentira para las guardas: aquí lo que se prueba es `Act`, no el
// movimiento, y montar una manada entera para comprobar un `return` sería
// medir otra cosa. Lo que SÍ entra por la manada de verdad es el apartado
// siguiente — y es el que mide que el NPC llega.
function asaFalsa(estado = {}) {
  const s = {
    vivo: true, enEscena: false, enemigo: false, ancho: 32, proximidad: 35.2,
    destino: null, hechos: [], ...estado,
  };
  return {
    get vivo() { return s.vivo; },
    get enEscena() { return s.enEscena; },
    get enemigo() { return s.enemigo; },
    get ancho() { return s.ancho; },
    get proximidad() { return s.proximidad; },
    destinoActual: () => s.destino,
    tieneDestino: () => Boolean(s.destino) && !s.llegado,
    mandarA: ({ destino, proximidad }) => {
      s.destino = { origen: [...destino], proximidad };
      s.hechos.push("mandarA");
    },
    mirar: (a) => s.hechos.push(`mirar ${a.join(",")}`),
    animacionDeReposo: () => s.hechos.push("reposo"),
    animar: (n) => s.hechos.push(`animar ${n}`),
    secuenciaAcabada: () => Boolean(s.secuenciaAcabada),
    ponerEnEscena: (si) => { s.enEscena = Boolean(si); s.hechos.push(`enEscena ${si}`); },
    soltarLaEscena: () => s.hechos.push("soltar"),
    aplazarElPaseo: () => s.hechos.push("aplazar"),
    evento: (n) => { s.hechos.push(`evento ${n}`); return true; },
    _s: s,
  };
}

const ENTIDAD = {
  i: 7, nombre: "edrinspot", tipo: TIPO.MOVER, npc: "edrin",
  origen: [1408, 224, -96], angulos: [0, 270, 0], animDeAndar: "walk",
  alAcabar: null, alCortarse: null, retrasoAlAcabar: 0, paraLaIa: false,
};

function director(asa, { t = { v: 0 }, disparos = [], apuntes = [] } = {}) {
  const d = new Escenas({
    reloj: () => t.v,
    npcPorNombre: () => asa,
    disparar: (n, quien) => disparos.push({ n, quien }),
    apuntar: (m) => apuntes.push(m),
  });
  return { d, t, disparos, apuntes };
}

describe("77 · las guardas de `NPCScript::Act`, una por `return`", () => {
  test("un NPC que no existe se cuenta, y no en el mismo saco que los demás", () => {
    const apuntes = [];
    const d = new Escenas({ reloj: () => 0, npcPorNombre: () => null, apuntar: (m) => apuntes.push(m) });
    assert.equal(d.empezar(ENTIDAD), "escena: el NPC no existe");
    assert.deepEqual(apuntes, ["escena: el NPC no existe"]);
  });

  test("un NPC muerto no atiende (npcact.cpp:83)", () => {
    const asa = asaFalsa({ vivo: false });
    const { d } = director(asa);
    assert.equal(d.empezar(ENTIDAD), "escena: el NPC está muerto");
    assert.equal(d.vivas.length, 0);
  });

  test("uno que ya está en una escena tampoco (npcact.cpp:128)", () => {
    const asa = asaFalsa({ enEscena: true });
    const { d } = director(asa);
    assert.equal(d.empezar(ENTIDAD), "escena: el NPC ya está en una escena");
  });

  test("uno PELEANDO no atiende si el mapa no pone `stopai` (npcact.cpp:131)", () => {
    const asa = asaFalsa({ enemigo: true });
    const { d } = director(asa);
    assert.equal(d.empezar(ENTIDAD), "escena: el NPC está peleando");
    // Y el control del otro lado: con `stopai`, el mismo NPC peleando SÍ.
    const asa2 = asaFalsa({ enemigo: true });
    const { d: d2 } = director(asa2);
    assert.equal(d2.empezar({ ...ENTIDAD, paraLaIa: true }), null);
  });

  test("un `type` que no es ninguno de los cinco no deja al NPC en escena", () => {
    const asa = asaFalsa();
    const { d } = director(asa);
    assert.equal(d.empezar({ ...ENTIDAD, tipo: 9 }), "escena: tipo 9 no existe");
    // El `return` del motor está ANTES de `m_MonsterState = MONSTERSTATE_SCRIPT`
    // (npcact.cpp:181), así que el NPC se queda libre. Si se quedara en escena,
    // el mapa se bloquearía con una entidad mal escrita.
    assert.equal(asa.enEscena, false);
  });

  test("ocupada: con el activador correcto DUPLICA, y sin él se calla", () => {
    const asa = asaFalsa();
    const { d, apuntes } = director(asa);
    assert.equal(d.empezar(ENTIDAD, "edrin"), null);
    // Segunda llamada sin activador: no duplica.
    assert.equal(d.empezar(ENTIDAD, null), "escena: ocupada y sin activador con su nombre");
    // Con el activador que se llama como el `target`, sí (npcact.cpp:91-93).
    assert.equal(d.empezar(ENTIDAD, "edrin"), null);
    assert.equal(d.vivas.filter((s) => s.copia).length, 1);
    assert.ok(apuntes.includes("escena: ocupada y sin activador con su nombre"));
  });
});

describe("77 · el tipo 2 sigue yendo por su rama, y sin congelar al NPC", () => {
  test("lanza el evento y NO deja al NPC en escena (npcact.cpp:138-144)", () => {
    const asa = asaFalsa();
    const { d } = director(asa);
    assert.equal(d.empezar({ ...ENTIDAD, tipo: TIPO.EVENTO, eventoDelNpc: "ask" }), null);
    assert.ok(asa._s.hechos.includes("evento ask"));
    // El `return` de la primera rama se salta el `MONSTERSTATE_SCRIPT` del
    // final. Si lo pusiera, el sacerdote se quedaría clavado al saludarte.
    assert.equal(asa.enEscena, false);
    // Y acaba en el acto: no hay `Think` para el tipo 2.
    assert.equal(d.vivas.length, 0);
  });
});

describe("77 · los dos fallos del mod, portados con el fallo puesto", () => {
  test("`m_EarlyBreak` NO se limpia: una escena cortada queda marcada para siempre", () => {
    const asa = asaFalsa();
    const { d, t, disparos } = director(asa);
    const e = { ...ENTIDAD, alAcabar: "bien", alCortarse: "mal", retrasoAlAcabar: 4 };
    // 1) se corta: otro le cambia el destino al NPC.
    assert.equal(d.empezar(e), null);
    asa._s.destino = { origen: [0, 0, 0], proximidad: 5 };
    t.v = 0.1; d.paso();
    assert.deepEqual(disparos, [{ n: "mal", quien: "edrin" }]);
    // 2) segunda vuelta LIMPIA: llega sin que nadie le toque nada.
    disparos.length = 0;
    asa._s.destino = null;
    assert.equal(d.empezar(e), null);
    asa._s.llegado = true;                 // `!HasConditions(MONSTER_HASMOVEDEST)`
    t.v = 0.2; d.paso();
    // Y aun así dispara `fireonbreak`, y SIN esperar sus 4 s: el `if
    // (m_flFireDelay && !m_EarlyBreak)` de npcact.cpp:295 ya no se cumple.
    assert.deepEqual(disparos, [{ n: "mal", quien: "edrin" }],
      "con `m_EarlyBreak` limpiándose saldría `bien` y cuatro segundos después");
  });

  test("`setmovedest none` hace que la escena se CREA que el NPC ha llegado", () => {
    const asa = asaFalsa();
    const { d, t, disparos } = director(asa);
    assert.equal(d.empezar({ ...ENTIDAD, alAcabar: "listo", alCortarse: "roto" }), null);
    // `StopWalking(); ClearConditions(MONSTER_HASMOVEDEST);` — el valor del
    // `dest_t` se queda escrito (npcscript.cpp:1608-1612).
    asa._s.llegado = true;
    t.v = 0.1; d.paso();
    // Así que NO es un corte: es una llegada, con su `firewhendone`.
    assert.deepEqual(disparos, [{ n: "listo", quien: "edrin" }]);
    // Y el NPC acaba mirando al rumbo de la ENTIDAD, no a donde iba.
    assert.ok(asa._s.hechos.includes("mirar 0,270,0"));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("77 · Edrin, con la manada y el mapa de verdad", () => {
  /** Una manada con el censo horneado de Edana, y el asa por donde entra el juego. */
  function pueblo() {
    const m = new Manada(censo, { azar: () => 0.5 });
    const i = m.porObjetivo("edrin");
    assert.ok(i, "Edrin está en el censo de Edana");
    // El `.mdl` no se lee en Node: las velocidades las pone la prueba, y por
    // eso ninguna medida de abajo es «cuántos segundos tarda».
    i.velocidad = 1; i.velocidadCorriendo = 2;
    const eventos = [];
    const disparos = [];
    const t = { v: 0 };
    const asa = m.asaDeEscena(i, { evento: (n, p) => { eventos.push([n, ...(p ?? [])]); return true; } });
    const d = new Escenas({
      reloj: () => t.v,
      npcPorNombre: (n) => (n === "edrin" ? asa : null),
      disparar: (n, quien) => disparos.push({ n, quien }),
      apuntar: () => {},
    });
    const U = m.U;
    /** Un `ms_npcscript` del horneado, con el origen pasado a unidades. */
    const deMapa = (nombre) => {
      const e = porNombre(nombre);
      return {
        i: e.entidad, nombre: e.nombre, tipo: e.tipo, npc: e.npc,
        eventoDelNpc: e.eventoDelNpc, animDeAndar: e.animDeAndar,
        animDeAccion: e.animDeAccion, alAcabar: e.alAcabar, alCortarse: e.alCortarse,
        retrasoAlAcabar: e.retrasoAlAcabar, paraLaIa: e.paraLaIa,
        origen: e.escena.map((v) => v * U), angulos: e.angulos,
      };
    };
    /** Un paso del mundo: la manada se mueve y la escena piensa. */
    const paso = (dt) => {
      t.v += dt;
      m.pasear(dt, { libre: () => true, suelo: () => i.donde[1] });
      d.paso();
    };
    /**
     * Andar hasta llegar Y DEJAR QUE LA ESCENA SE ENTERE.
     *
     * Las tres primeras versiones de estas pruebas salieron rojas por parar en
     * cuanto `i.mandado` se iba a `null`, y ése es el instante en que la MANADA
     * ha llegado — la escena no se entera hasta su siguiente `MoveThink`, 0,1 s
     * después (npcact.cpp:236). O sea que el bucle terminaba justo antes de lo
     * que venía a medir: ni el giro final ni el evento del tipo 4. Es el primo
     * del 75 con las décimas, y por eso el límite va en tiempo y no en «hasta
     * que el destino desaparezca».
     */
    const andarHastaLlegar = (tope = 20) => {
      const t0 = t.v;
      while (t.v < t0 + tope && i.mandado) paso(0.05);
      const t1 = t.v;
      while (t.v < t1 + 0.3) paso(0.05);     // tres `nextthink`: de sobra para uno
      return t.v - t0;
    };
    return { m, i, d, t, eventos, disparos, asa, U, deMapa, paso, andarHastaLlegar };
  }

  test("EL VALOR DE REPOSO: Edrin YA está dentro de `edrinspot` sin moverse", faltaEdana, () => {
    // Esto va el primero a propósito. «Edrin está en `edrinspot`» es CIERTO
    // antes de que nada pase: su sitio de nacer y el del `ms_npcscript` están
    // a 32 unidades, y su proximidad es 35,2. Un control que midiera «ha
    // llegado a edrinspot» estaría leyendo el valor de reposo — el apartado 4
    // de CLAUDE.md entero, y la razón de que lo que se mide abajo sea el viaje
    // a las flores y la vuelta, y no el destino.
    const { i, U, deMapa } = pueblo();
    const spot = deMapa("edrinspot");
    const ojo = [i.donde[0] * U, i.donde[1] * U + (i.ficha.ia?.alto ?? 72) * 0.9, i.donde[2] * U];
    const dx = spot.origen[0] - ojo[0], dz = spot.origen[2] - ojo[2];
    const d = Math.hypot(dx, dz);
    assert.ok(Math.abs(d - 32) < 0.5, `salen ${d.toFixed(1)} unidades`);
    assert.equal(i.ficha.ia.cercaniaDeDestino, 35.2);
    assert.ok(haLlegado({ destino: spot.origen, ojo, proximidad: 35.2 }),
      "con 32 < 35,2 ya está llegado: `edrinspot` solo no mueve a nadie");
  });

  test("`edrinstrict1` (tipo 4) lo manda a las flores, que SÍ están lejos", faltaEdana, () => {
    const { i, d, U, deMapa, andarHastaLlegar } = pueblo();
    const flores = deMapa("edrinstrict1");
    const antes = [...i.donde];
    assert.equal(d.empezar(flores), null);
    // El destino está a 125 unidades: muy por encima de los 35,2, así que esto
    // es un viaje y no un redondeo.
    const dist = Math.hypot(flores.origen[0] - antes[0] * U, flores.origen[2] - antes[2] * U);
    assert.ok(dist > 100, `las flores están a ${dist.toFixed(0)} unidades`);
    // Y se pone a andar con la animación que pide el mapa: `moveanim run`.
    assert.equal(i.andando, "escena");
    // Lo que se pidió, que es lo que el mapa manda. `nombreActual` no sirve
    // aquí: sin `.mdl` no hay secuencia que poner y se quedaría a `null` con
    // el trabajo bien hecho.
    assert.equal(i.animPedida, "run");
    assert.ok(i.mandado, "tiene destino mandado");
    andarHastaLlegar();
    assert.equal(i.mandado, null, "ha llegado y ha soltado el destino");
    assert.ok(Math.hypot(i.donde[0] - antes[0], i.donde[2] - antes[2]) > 2,
      "se ha movido de verdad, no se ha dado por llegado donde estaba");
  });

  test("al llegar: `game_stopmoving` ANTES que `game_reached_dest`", faltaEdana, () => {
    const { d, eventos, deMapa, andarHastaLlegar } = pueblo();
    assert.equal(d.empezar(deMapa("edrinstrict1")), null);
    andarHastaLlegar();
    const soloLlegada = eventos.map(([n]) => n).filter((n) => n === "game_stopmoving" || n === "game_reached_dest");
    // El orden sale de que `SetMoveDest` llama primero a `StopWalking()`
    // (msmonsterserver.cpp:1026) y el evento de llegada va en la línea de
    // después (:1027). Es al revés de lo que parece.
    assert.deepEqual(soloLlegada, ["game_stopmoving", "game_reached_dest"]);
    // Y mientras andaba avisó, con el rumbo dentro.
    const andando = eventos.filter(([n]) => n === "game_movingto_dest");
    assert.ok(andando.length > 3, `${andando.length} avisos de que va andando`);
    assert.ok(Number.isFinite(Number(andando[0][1])), "el rumbo viaja como PARAM1");
  });

  test("y entonces lanza `trig_flowercompliant` y, 4 s después, `edrinspot`", faltaEdana, () => {
    const { d, t, eventos, disparos, deMapa, paso, andarHastaLlegar } = pueblo();
    assert.equal(d.empezar(deMapa("edrinstrict1")), null);
    andarHastaLlegar();
    // El tipo 4 es MOVER y LUEGO lanzar el evento.
    assert.ok(eventos.some(([n]) => n === "trig_flowercompliant"), "le ha hablado a su guion");
    // Y el `firewhendone` espera sus `firedelay` segundos. Esto es lo que una
    // sonda no puede medir y esta prueba sí: el reloj lo avanza ella.
    assert.deepEqual(disparos, [], "nada más llegar todavía no");
    // ── EL RELOJ SE LE PREGUNTA A LA ESCENA, NO A MI ESPERA ───────────────
    //
    // La primera versión contaba 3,9 s **desde que la prueba dejó de andar**,
    // y salió roja con el trabajo bien hecho: la escena había acabado hasta
    // 0,3 s antes, porque el bucle de andar sigue dando pasos hasta que el
    // `MoveThink` se entera. O sea que el umbral medía mi espera y no el
    // retraso — el mismo error que el 75 con el reloj del objeto en el suelo.
    //
    // Lo que no depende de mi espera son dos cosas: que el retraso apuntado
    // sean los 4 s del mapa, y la hora exacta a la que la escena va a disparar.
    const espera = d.diario.filter((x) => x.que === "espera").at(-1);
    assert.equal(espera?.retraso, 4, "el `firedelay` del mapa son 4 s");
    const [corriendo] = d.censo();
    assert.equal(corriendo.fase, "esperandoElDisparo");
    const hora = corriendo.cuando;
    while (t.v < hora - 0.1) paso(0.05);
    assert.deepEqual(disparos, [], "una décima antes de su hora, nada");
    while (t.v < hora + 0.1) paso(0.05);
    assert.deepEqual(disparos, [{ n: "edrinspot", quien: "edrin" }]);
  });

  test("acaba mirando al rumbo de la ENTIDAD, no a por donde vino", faltaEdana, () => {
    const { i, d, deMapa, paso, andarHastaLlegar } = pueblo();
    const grados = () => ((i.yaw * 180) / Math.PI + 360) % 360;
    const alNacer = grados();
    assert.ok(Math.abs(alNacer - 270) < 0.01, `nace mirando a ${alNacer.toFixed(1)}°`);
    assert.equal(d.empezar(deMapa("edrinstrict1")), null);
    // ── EL CONTROL POSITIVO, QUE AQUÍ HACE FALTA DE VERDAD ────────────────
    //
    // Edrin NACE mirando a 270 y la entidad pide 260: diez grados. Sin esta
    // medida de en medio, «acaba a 260» no distinguiría «ha girado al llegar»
    // de «nunca ha girado y se ha quedado cerca». Andando mira a 230,2°, que
    // es el rumbo de la marcha —atan2(−96, −80)— y no se parece a ninguno de
    // los dos.
    paso(0.05);
    const andando = grados();
    assert.ok(Math.abs(andando - 230.2) < 1, `andando mira a ${andando.toFixed(1)}°`);
    andarHastaLlegar();
    // `pMonster->pev->angles = pev->angles` (npcact.cpp:249) pisa el giro que
    // `SetMoveDest` había puesto al llegar (msmonsterserver.cpp:1021-1023).
    // `edrinstrict1` dice `angles 0 260 0`.
    const fin = grados();
    assert.ok(Math.abs(fin - 260) < 0.01, `acaba mirando a ${fin.toFixed(1)}°`);
  });

  // Lo que esta prueba mide es EL REPARTO —que `Manada.pasear` le cede la
  // casilla a `pasoMandado`— y no el aplazamiento de los relojes del paseo.
  // Se comprobó rompiendo las dos cosas por separado: quitar el reparto la
  // pone roja, y dejar `Vagabundo.aplazar` sin hacer nada **no**. La razón
  // está escrita en `src/play/paseo.js`: con dos casillas, el paseo ya está
  // parado antes de llegar a ese reloj.
  test("mientras una escena manda, la casilla es suya y el paseo no la toca", faltaEdana, () => {
    const { i, d, deMapa, paso } = pueblo();
    // Edrin trae `roam 0`, así que para medir esto hace falta uno que pasee:
    // se le enciende, que es lo que hace `roam 1` en un guion.
    i.vagabundo.pasea = true;
    assert.equal(d.empezar(deMapa("edrinstrict1")), null);
    const destino = [...i.mandado.origen];
    // Doce segundos: más que los siete del `m_NodeCancelTime`, que es el plazo
    // que de otro modo le soltaría el destino a mitad de camino.
    for (let k = 0; k < 240; k++) { paso(0.05); if (!i.mandado) break; }
    assert.equal(i.vagabundo.tieneDestino, false, "el paseo no le ha quitado la casilla");
    assert.ok(i.llegadas >= 1, "ha llegado por la vía de la escena");
    assert.deepEqual(i.ultimoDestino.origen, destino);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("77 · el bus: lo que sale por `aplicarDisparos`", () => {
  const ESC = {
    clase: "ms_npcscript", nombre: "e", objetivo: null, tipo: 0, npc: "edrin",
    animDeAndar: "walk", alAcabar: "x", retrasoAlAcabar: 4, paraLaIa: false,
    escena: [1, 2, 3], angulos: [0, 270, 0],
  };

  test("un tipo que mueve sale como `escenaDeNpc` con el pedido entero", () => {
    const bus = new Disparadores([ESC]);
    bus.disparar("e", { nombre: "jugador" }, USO.ALTERNAR, 0, null);
    const s = bus.recoger().find((x) => x.tipo === "escenaDeNpc");
    assert.ok(s, "sale por su propia puerta y no por `usar`");
    assert.equal(s.escenaTipo, 0);
    assert.equal(s.npc, "edrin");
    assert.equal(s.animDeAndar, "walk");
    assert.equal(s.alAcabar, "x");
    assert.equal(s.retrasoAlAcabar, 4);
    assert.deepEqual(s.escena, [1, 2, 3]);
    assert.deepEqual(s.angulos, [0, 270, 0]);
  });

  test("y el tipo 2 sigue saliendo como `eventoDeNpc` (el 67, intacto)", () => {
    const bus = new Disparadores([{ ...ESC, tipo: 2, eventoDelNpc: "ask" }]);
    bus.disparar("e", { nombre: "jugador" }, USO.ALTERNAR, 0, null);
    const salidas = bus.recoger();
    assert.ok(salidas.some((x) => x.tipo === "eventoDeNpc" && x.evento === "ask"));
    assert.ok(!salidas.some((x) => x.tipo === "escenaDeNpc"));
  });

  test("`mstrig_act` es la misma clase y entra igual (npcact.cpp:54-55)", () => {
    const bus = new Disparadores([{ ...ESC, clase: "mstrig_act" }]);
    bus.disparar("e", { nombre: "jugador" }, USO.ALTERNAR, 0, null);
    assert.ok(bus.recoger().some((x) => x.tipo === "escenaDeNpc"));
  });

  test("los tres de Edana salen por la puerta nueva, y son 2 del 0 y 1 del 4", faltaEdana, () => {
    const lista = npcscriptsDeEdana().filter((d) => (d.tipo ?? 0) !== 2);
    assert.equal(lista.length, 3);
    assert.deepEqual(lista.map((d) => d.tipo).sort(), [0, 0, 4]);
    // El de tipo 0 que apunta al sacerdote NO TIENE NOMBRE, así que en el juego
    // tampoco lo dispara nadie — y además lleva un `eventname` que su tipo no
    // mira: el tipo 0 anda y acaba, sin lanzar nada. Es del mapa, no nuestro.
    const sinNombre = lista.filter((d) => !d.nombre);
    assert.equal(sinNombre.length, 1);
    assert.equal(sinNombre[0].npc, "priest");
    assert.equal(sinNombre[0].eventoDelNpc, "player_spawned");
    assert.equal(mueve(sinNombre[0].tipo), true);
  });
});
