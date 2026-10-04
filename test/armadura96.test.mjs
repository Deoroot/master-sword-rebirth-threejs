// EL 96: LA ARMADURA PUESTA.
//
// Lo que se prueba, y por dónde entra:
//
//   - El personaje es `crearPersonaje` y la pieza entra en `personaje.objetos`
//     como entra al comprarla: `{ id, n: 1 }`. No hay objeto de armadura
//     escrito a mano: la protección sale de SU guion horneado
//     (`build/msr/objetosguion.json`) corriendo en `GuionDeObjeto`.
//   - Se monta como la monta el juego (`arrancar`, con `seVisteAlCargar`, lo
//     mismo que `sincronizarObjetosVivos` de src/main.js), se pone con `vestir`
//     y el golpe pasa por `defensaDelJugador`, que es lo que llama `golpear`.
//   - El dueño es el `GuionDelJugador` de verdad, con `build/msr/jugador.json`:
//     la resistencia al fuego y al aturdimiento las escribe SU guion.
//
// Ver src/play/armadura.js y doc/ARMADURA_96.md.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { crearPersonaje } from "../src/juego/personaje.js";
import { atributosDe } from "../src/juego/stats.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";
import { GuionesDeObjeto, GuionDeObjeto, QUIEN_VISTE } from "../src/play/guionobjeto.js";
import { TablaDeEfectos } from "../src/play/efectos.js";
import { defensaDelJugador } from "../src/play/escudo.js";
import {
  vestir, puedeVestir, fichasPuestas, seVisteAlCargar, POSICIONES_DEL_JUGADOR,
} from "../src/play/armadura.js";
import { partirGuion, Guion, entornoVacio } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";

const OBJETOS = "build/msr/objetos.json";
const GUIONES = "build/msr/objetosguion.json";
const JUGADOR = "build/msr/jugador.json";
const EFECTOS = "build/msr/efectosguion.json";
const hay = [OBJETOS, GUIONES, JUGADOR, EFECTOS].every(existsSync);
const leer = (f) => JSON.parse(readFileSync(f, "utf8"));

const catalogo = hay ? leer(OBJETOS) : null;
const lista = catalogo ? (Array.isArray(catalogo.objetos) ? catalogo.objetos : Object.values(catalogo.objetos)) : [];
const fichaDe = (id) => lista.find((o) => o.id === id) ?? null;
const guiones = hay ? new GuionesDeObjeto(leer(GUIONES)) : null;
const fichaJugador = hay ? leer(JUGADOR) : null;
const tablaEfectos = hay ? new TablaDeEfectos(leer(EFECTOS)) : null;

/**
 * Un personaje con su guion y lo que lleva, montado como en `main.js`.
 * `fuego` es su Spellcasting/Fire; `hacha` sube su fuerza (`GETSTAT`: 2,0/4).
 */
function montar({ llevar = [], fuego = 0, hacha = 0 } = {}) {
  const personaje = crearPersonaje({ nombre: "Ana" });
  personaje.habilidades.spellcasting.fire.valor = fuego;
  // `valorDeHabilidad` es la media redondeada de sus tres propiedades.
  if (hacha) for (const k of Object.keys(personaje.habilidades.axehandling)) personaje.habilidades.axehandling[k].valor = hacha;
  let t = 10;
  const dicho = [];
  const avisos = [];
  const jugador = new GuionDelJugador({
    ficha: fichaJugador, personaje, efectos: tablaEfectos,
    suceso: (tipo, texto) => dicho.push({ tipo, texto }),
    consejo: () => {}, dar: () => {}, ahora: () => t,
    aviso: (titulo, texto) => avisos.push({ titulo, texto }),
  });
  const vivos = new Map();
  for (const id of llevar) personaje.objetos.push({ id, n: 1 });
  // `sincronizarObjetosVivos`, src/main.js: por cada objeto con guion.
  for (const o of personaje.objetos) {
    if (!guiones.tiene(o.id)) continue;
    const ent = new GuionDeObjeto({ guiones, id: o.id, jugador, ahora: () => t, suceso: (tipo, texto) => dicho.push({ tipo, texto }) });
    ent.arrancar({ genero: "male", quien: QUIEN_VISTE.CARGA, viste: seVisteAlCargar(fichaDe(o.id), o), puesto: Boolean(o.puesto) });
    vivos.set(o.id, ent);
  }
  const avanzar = (s) => {
    for (let k = 0; k < Math.round(s / 0.05); k++) {
      t += 0.05;
      for (const e of vivos.values()) e.paso(0.05);
      jugador.paso(0.05);
    }
  };
  const ponerse = (id) => {
    const entrada = personaje.objetos.find((o) => o.id === id);
    return vestir({
      entrada, ficha: fichaDe(id), objeto: vivos.get(id) ?? null,
      puestas: fichasPuestas(personaje.objetos, fichaDe),
    });
  };
  // `golpear` de src/main.js: la defensa entera, con lo que lleva en orden.
  const pegar = (dano, tipo = "") => defensaDelJugador({
    dano, tipo, parry: 0, dados: { acierto: 1 },
    equipo: [...vivos.values()], atacante: "Goblin",
  });
  return { personaje, jugador, vivos, dicho, avisos, avanzar, ponerse, pegar };
}

describe("la armadura del fénix (96)", { skip: !hay && "faltan los horneados" }, () => {
  test("las fichas que se usan son las del juego", () => {
    const f = fichaDe("armor_pheonix55");
    assert.deepEqual(f.ranuras, ["chest", "arms", "legs"]);
    assert.ok(guiones.tiene("armor_pheonix55"), "el guion del fénix no está horneado: `npm run objetos:guion`");
    assert.ok(guiones.tiene("armor_helm_gray"));
  });

  test("PUESTA, un golpe de 10 se queda en 4,5: el 55 % de su `BARMOR_PROTECTION`", () => {
    const m = montar({ llevar: ["armor_pheonix55"] });
    const r = m.ponerse("armor_pheonix55");
    assert.equal(r.puesto, true, r.mensaje ?? r.porque);
    const d = m.pegar(10, "");
    // 10 × (100 − 0) × 0,01 (Armor_Protect, ARMOR_PROTECTION 0) × (1 − 0,55)
    assert.equal(d.dano, 4.5);
    assert.equal(d.armadura.piezas[0].id, "armor_pheonix55");
    // Y el C++ registró la armadura con protección CERO, que es el fallo
    // de la plantilla (armor_base.script:37 antes de :41).
    assert.equal(m.vivos.get("armor_pheonix55").armadura.proteccion, 0);
  });

  test("CONTROL POSITIVO: la misma armadura EN LA MOCHILA no protege nada", () => {
    const m = montar({ llevar: ["armor_pheonix55"] });
    assert.equal(m.pegar(10, "").dano, 10);
    assert.equal(m.pegar(10, "slash").dano, 10);
  });

  test("el veneno se queda en la MITAD, no en el 45 %: `PARAM4 contains poison`", () => {
    const m = montar({ llevar: ["armor_pheonix55"] });
    m.ponerse("armor_pheonix55");
    assert.equal(m.pegar(10, "poison_effect").dano, 5);
  });

  test("sin fuego 20, la armadura lo dice y el fuego NO se resiste", () => {
    const m = montar({ llevar: ["armor_pheonix55"], fuego: 0, hacha: 80 });
    m.ponerse("armor_pheonix55");
    m.avanzar(0.5);
    assert.ok(m.dicho.some((d) => d.texto === "You lack the fire skill to activate this armor's magic."), JSON.stringify(m.dicho));
    assert.equal(m.jugador.resistencias.multiplicar(10, "fire"), 10);
  });

  test("con fuego 25: «Your resistance to fire is now 75%», y el fuego entra al 25 %", () => {
    const m = montar({ llevar: ["armor_pheonix55"], fuego: 25, hacha: 80 });
    m.ponerse("armor_pheonix55");
    m.avanzar(0.5);
    assert.ok(m.dicho.some((d) => d.texto === "Your resistance to fire is now 75%"), JSON.stringify(m.dicho));
    assert.equal(m.jugador.resistencias.multiplicar(10, "fire"), 2.5);
    // Y lo que no es fuego, entero.
    assert.equal(m.jugador.resistencias.multiplicar(10, "cold"), 10);
  });

  test("EL FALLO DEL 20: con fuego 20 exacto no hay mensaje NI resistencia (`< 20` y `> 20`)", () => {
    const m = montar({ llevar: ["armor_pheonix55"], fuego: 20, hacha: 80 });
    m.ponerse("armor_pheonix55");
    m.avanzar(0.5);
    assert.ok(!m.dicho.some((d) => /fire skill|resistance to fire/.test(d.texto)), JSON.stringify(m.dicho));
    assert.equal(m.jugador.resistencias.multiplicar(10, "fire"), 10);
  });

  test("fuerza bajo 40: a la décima, «Insufficient Strength for Armor» y el efecto de lentitud", () => {
    const m = montar({ llevar: ["armor_pheonix55"] });
    assert.ok(atributosDe(m.personaje.habilidades).strength < 40);
    m.ponerse("armor_pheonix55");
    // Mientras corre `game_wear` la pieza NO está puesta (genericitem.cpp:1135
    // y :1139): el aviso llega por el `callevent 0.1`.
    assert.equal(m.avisos.length, 0, "el aviso salió antes de estar puesta");
    m.avanzar(0.2);
    assert.deepEqual(m.avisos[0], {
      titulo: "Insufficient Strength for Armor",
      texto: "You are too weak to move freely in this armor. (Min Strength 40)",
    });
    assert.ok(m.jugador.efectos.lista.some((e) => /effect_slow/.test(String(e.ruta ?? e.nombre ?? e.id ?? JSON.stringify(e)))),
      `sin effect_slow: ${JSON.stringify(m.jugador.efectos.historial).slice(0, 400)}`);
  });

  test("y CONTROL: con fuerza 40 JUSTA no hay aviso (`<`, no `<=`)", () => {
    // Hacha 77 da fuerza 40 exacta con el resto de un personaje nuevo.
    const m = montar({ llevar: ["armor_pheonix55"], hacha: 77 });
    assert.equal(atributosDe(m.personaje.habilidades).strength, 40);
    m.ponerse("armor_pheonix55");
    m.avanzar(0.5);
    assert.equal(m.avisos.length, 0);
  });

  test("en la mochila al cargar, su `game_wear` no corre: no registra el fuego", () => {
    const m = montar({ llevar: ["armor_pheonix55"], fuego: 25 });
    m.avanzar(0.5);
    assert.equal(m.jugador.resistencias.multiplicar(10, "fire"), 10);
  });
});

describe("el yelmo de estabilidad (96)", { skip: !hay && "faltan los horneados" }, () => {
  test("EL FALLO: su «60 %» no protege del daño — no incluye `armor_base`", () => {
    const m = montar({ llevar: ["armor_helm_gray"] });
    const r = m.ponerse("armor_helm_gray");
    assert.equal(r.puesto, true);
    assert.equal(m.vivos.get("armor_helm_gray").armadura, null, "el yelmo no hace `registerarmor`");
    assert.equal(m.pegar(10, "").dano, 10);
  });

  test("lo que SÍ hace: aturdimiento al 0,3 y «Your stun resistance is now 70%»", () => {
    const m = montar({ llevar: ["armor_helm_gray"] });
    m.ponerse("armor_helm_gray");
    m.avanzar(0.5);
    assert.equal(m.jugador.resistencias.leer("stun"), "0.30");
    assert.ok(m.dicho.some((d) => d.texto === "Your stun resistance is now 70%"), JSON.stringify(m.dicho));
  });

  test("con el fénix: 4,5 — el yelmo no añade nada", () => {
    const m = montar({ llevar: ["armor_pheonix55", "armor_helm_gray"] });
    assert.equal(m.ponerse("armor_pheonix55").puesto, true);
    assert.equal(m.ponerse("armor_helm_gray").puesto, true);
    assert.equal(m.pegar(10, "").dano, 4.5);
  });
});

describe("dónde cabe (`CanWearItem`)", { skip: !hay && "faltan los horneados" }, () => {
  test("fénix y chaleco de cuero: «You have no more chest slots»", () => {
    const m = montar({ llevar: ["armor_pheonix55", "armor_leather"] });
    assert.equal(m.ponerse("armor_pheonix55").puesto, true);
    const r = m.ponerse("armor_leather");
    assert.equal(r.puesto, false);
    assert.equal(r.mensaje, "You have no more chest slots\n");
    // Y el que no cabe no protege: sigue 4,5 y no 4,5 × lo del cuero.
    assert.equal(m.pegar(10, "").dano, 4.5);
  });

  test("dos yelmos: «You have no more head slots»", () => {
    const m = montar({ llevar: ["armor_helm_gray", "armor_helm_bronze"] });
    assert.equal(m.ponerse("armor_helm_gray").puesto, true);
    assert.equal(m.ponerse("armor_helm_bronze").mensaje, "You have no more head slots\n");
  });

  test("las plazas son las de `game_reset_wear_positions`", () => {
    assert.equal(POSICIONES_DEL_JUGADOR.chest, 1);
    assert.equal(POSICIONES_DEL_JUGADOR.arms, 2);
    assert.equal(POSICIONES_DEL_JUGADOR.head, 1);
    assert.equal(POSICIONES_DEL_JUGADOR.rightfinger, 10);
  });

  test("EL FALLO DEL ÍNDICE (regla, no camino: en los datos del juego no se da)", () => {
    // `iSlots += pItemWorn->m_WearPositions[iloc].Slots` con `iloc` de la
    // pieza NUEVA (genericitem.cpp:1088). Con unos brazales `arms` puestos y
    // algo que pida `chest;arms`, `arms` es su índice 1 y los brazales sólo
    // tienen el 0: el motor lee fuera y aquí vale 0. Con el índice bueno
    // serían 2 de 2 y cabría igual — por eso hace falta `arms` lleno.
    const brazales = { id: "a", nombre: "A", vestible: true, ranuras: ["arms"] };
    const otros = { id: "b", nombre: "B", vestible: true, ranuras: ["arms"] };
    const coraza = { id: "c", nombre: "C", vestible: true, ranuras: ["chest", "arms"] };
    // Con el índice bueno: 1 + 1 + 1 = 3 > 2. Con el del motor: 0 + 0 + 1.
    assert.equal(puedeVestir({ ficha: coraza, puestas: [brazales, otros] }).puede, true);
  });
});

describe("las dos piezas del intérprete que la armadura necesitaba (96)", () => {
  // Si hay un analizador, la prueba le da TEXTO (el 67).
  const correr = (archivos, raiz, entorno = {}) => {
    const g = resolverGuion(raiz, (r) => (archivos[r] ? partirGuion(archivos[r]) : null), new Set());
    return new Guion({ eventos: g.eventos, preload: g.preload, entorno: { ...entornoVacio(), ...entorno } });
  };

  test("`[override]` borra al padre, el de un `#include` anterior también", () => {
    const archivos = {
      padre: "{ hola\n setvard QUIEN padre\n}\n{ adios\n setvard ADIOS padre\n}",
      hijo: "#include padre\n{ [override] hola\n setvard QUIEN hijo\n}\n{ adios\n setvard ADIOS2 hijo\n}",
    };
    const g = correr(archivos, "hijo");
    g.llamar("hola", []);
    g.llamar("adios", []);
    assert.equal(g.resolver("QUIEN"), "hijo");
    // Sin `[override]` corren los dos, y en orden.
    assert.equal(g.resolver("ADIOS"), "padre");
    assert.equal(g.resolver("ADIOS2"), "hijo");
  });

  test("`[server] [override]` también: las marcas pueden ir juntas", () => {
    const archivos = {
      padre: "{ hola\n setvard QUIEN padre\n}",
      hijo: "#include padre\n{ [server] [override] hola\n setvard QUIEN hijo\n}",
    };
    const g = correr(archivos, "hijo");
    g.llamar("hola", []);
    assert.equal(g.resolver("QUIEN"), "hijo");
  });

  test("`$neg` es `-atof` con «%.2f», y sin parámetro «0»", () => {
    const g = correr({ x: "{ e\n setvard A $neg(0.75)\n setvard B $neg(55%)\n}" }, "x");
    g.llamar("e", []);
    assert.equal(g.resolver("A"), "-0.75");
    assert.equal(g.resolver("B"), "-55.00");
  });
});
