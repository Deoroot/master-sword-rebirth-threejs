// EXPERIMENTO 82 · `env_sound`: la reverberación y a quién le toca ponerla.
//
// ── LO QUE ESTA PRUEBA NO PUEDE MEDIR, DICHO ANTES DE EMPEZAR ──────────────
//
// Que se OIGA. Aquí se mide el reparto —qué `room_type` tiene puesto el
// jugador— y la tabla de presets. Que ese preset llegue al `AudioContext` y
// suene a cueva lo tiene que medir una sonda, y mientras no exista **no se
// cuenta ningún verde por él**: es la trampa del 60, donde la regla estaba
// probada de punta a punta y lo que nadie miraba era el enrutado.
//
// ── Y POR QUÉ NO SE MIDE CONTRA GATE CITY ─────────────────────────────────
//
// Porque Gate City tiene **cero `env_sound`**, y con cero el valor correcto y
// el valor de reposo son la misma lista vacía: la trampa del 50. Las pruebas
// del reparto van contra Edana, que tiene once y además los tiene PISÁNDOSE,
// que es el caso que hace falta.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
  PRESETS, CAMPOS, presetDe, TIPO_DE_AGUA, tipoQueSeOye, alcanza, unTic,
} from "../src/play/reverberacion.js";
import { leerBsp, leerEntidades, origen } from "../src/bsp/lector.js";

const MAPAS = `${process.env.MSR_ASSETS ?? "../MSC/assets/msr"}/maps`;
const hayEdana = existsSync(`${MAPAS}/edana.bsp`);

/** Los once de Edana, leídos del `.bsp` y no escritos a mano. */
function fuentesDeEdana() {
  return leerEntidades(leerBsp(`${MAPAS}/edana.bsp`))
    .filter((e) => e.classname === "env_sound")
    .map((e, i) => ({
      clave: i,
      unidades: origen(e) ?? [0, 0, 0],
      radio: Number(e.radius ?? 0),
      tipo: Number(e.roomtype ?? 0),
      declaraTipo: e.roomtype !== undefined,
    }));
}

describe("LA TABLA DE PRESETS, copiada del motor (s_dsp.c:72-105)", () => {
  test("son 29, que es el `MAX_ROOM_TYPES` del motor", () => {
    assert.equal(PRESETS.length, 29);
    for (const p of PRESETS) assert.equal(p.length, CAMPOS.length);
  });

  test("el 0 es «off»: ni reverberación ni eco", () => {
    const p = presetDe(0);
    assert.equal(p.tamano, 0);
    assert.equal(p.reflejo, 0);
    assert.equal(p.retardo, 0);
    assert.equal(p.realim, 0);
  });

  test("los tres de agua (14-16) son los únicos con el paso bajo puesto", () => {
    // `room_lp` es 1.0 sólo en 14, 15 y 16: es lo que hace que debajo del agua
    // todo suene apagado. Si esta prueba se rompe, es que la tabla se copió mal.
    const conPaso = PRESETS.map((p, i) => [i, p[0]]).filter(([, lp]) => lp !== 0).map(([i]) => i);
    assert.deepEqual(conPaso, [14, 15, 16]);
  });

  test("el 26 («weirdo») es el único que modula", () => {
    const conMod = PRESETS.map((p, i) => [i, p[1]]).filter(([, m]) => m !== 0).map(([i]) => i);
    assert.deepEqual(conMod, [26]);
  });

  test("los tres tipos que usa Edana existen y son distintos entre sí", { skip: !hayEdana }, () => {
    // Edana usa 0, 11 y 13 — contado del `.bsp`, no escrito.
    const tipos = [...new Set(fuentesDeEdana().map((f) => f.tipo))].sort((a, b) => a - b);
    assert.ok(tipos.length >= 2, `Edana sólo usa ${tipos.join(", ")}`);
    for (const t of tipos) assert.ok(t >= 0 && t < PRESETS.length);
    // El 11 y el 13 son de la familia «brite», y se distinguen en el reflejo:
    // si los dos dieran el mismo preset, el reparto no se podría medir.
    const porTipo = new Map(tipos.map((t) => [t, JSON.stringify(presetDe(t))]));
    assert.equal(new Set(porTipo.values()).size, tipos.length, "dos tipos dan el mismo preset");
  });

  test("`bound` recorta a los dos lados: un tipo de 500 NO apaga nada", () => {
    // `idsp_room = bound( 0, idsp_room, MAX_ROOM_TYPES )`, s_dsp.c:809. Un
    // `?? PRESETS[0]` daría «off», que es lo contrario del último preset.
    assert.equal(presetDe(500).tipo, 28);
    assert.equal(presetDe(-7).tipo, 0);
    assert.notDeepEqual(presetDe(500), presetDe(0));
  });
});

describe("DEBAJO DEL AGUA MANDA EL AGUA (s_dsp.c:806)", () => {
  test("con los OJOS dentro se oye la 14, diga lo que diga la sala", () => {
    assert.equal(tipoQueSeOye({ tipo: 23, nivelDeAgua: 3 }), TIPO_DE_AGUA);
  });

  test("con el agua por la cintura todavía NO: la condición es `> 2`", () => {
    // `waterlevel > 2` son los ojos, no los pies. Con `>= 2` la reverberación
    // cambiaría al meter el pie en el estanque, que no es lo que hace el juego.
    assert.equal(tipoQueSeOye({ tipo: 23, nivelDeAgua: 2 }), 23);
    assert.equal(tipoQueSeOye({ tipo: 23, nivelDeAgua: 0 }), 23);
  });
});

describe("LAS TRES CONDICIONES PARA ALCANZAR (sound.cpp:896-922)", () => {
  const origenF = [0, 0, 0];
  const ojo = [100, 0, 0];

  test("dentro del radio y con la traza libre, alcanza", () => {
    const r = alcanza({ origen: origenF, radio: 128, ojoDelJugador: ojo });
    assert.equal(r.alcanza, true);
    assert.equal(Math.round(r.distancia), 100);
  });

  test("fuera del radio no alcanza, y la distancia se dice igual", () => {
    const r = alcanza({ origen: origenF, radio: 64, ojoDelJugador: ojo });
    assert.equal(r.alcanza, false);
    assert.equal(r.porQueNo, "fuera del radio");
    assert.equal(Math.round(r.distancia), 100);
  });

  test("una pared en medio lo corta aunque quepa de sobra en el radio", () => {
    const r = alcanza({
      origen: origenF, radio: 9999, ojoDelJugador: ojo,
      libre: () => ({ fraccion: 0.5 }),
    });
    assert.equal(r.alcanza, false);
    assert.equal(r.porQueNo, "pared en medio");
  });

  test("y CRUZAR EL AGUA lo corta con la traza entera libre", () => {
    // `(tr.fInOpen && tr.fInWater)`: es una condición aparte de `flFraction`,
    // y sin ella el `env_sound` de la plaza te sigue sonando con la cabeza
    // dentro del estanque. Con `fraccion: 1` el otro motivo no puede dispararse,
    // así que esta prueba sólo puede pasar por el motivo bueno.
    const r = alcanza({
      origen: origenF, radio: 9999, ojoDelJugador: ojo,
      libre: () => ({ fraccion: 1, cruzaAgua: true }),
    });
    assert.equal(r.alcanza, false);
    assert.equal(r.porQueNo, "cruza el agua");
  });

  test("se mide al OJO del jugador y no a sus pies", () => {
    // El motor suma `view_ofs` a los dos orígenes. A 100 unidades en
    // horizontal, con el ojo a 54 sobre los pies, la distancia al ojo es 113 y
    // a los pies 100: con un radio de 105 el resultado se INVIERTE. Es la
    // lección del 71 — una prueba sobre una diferencia tiene que poner los
    // números en los que la diferencia existe.
    const pies = [100, 0, 0];
    const conOjo = [100, 0, 54];
    assert.equal(alcanza({ origen: origenF, radio: 105, ojoDelJugador: pies }).alcanza, true);
    assert.equal(alcanza({ origen: origenF, radio: 105, ojoDelJugador: conOjo }).alcanza, false);
  });
});

describe("EL REPARTO: gana el más cercano, SIEMPRE", () => {
  // Dos fuentes: una lejana de tipo 23 y una cercana de tipo 11. El jugador
  // está al lado de la cercana, y las dos le alcanzan.
  const lejos = { clave: "lejos", unidades: [0, 0, 0], radio: 9999, tipo: 23 };
  const cerca = { clave: "cerca", unidades: [90, 0, 0], radio: 9999, tipo: 11 };
  const ojo = [100, 0, 0];

  test("con el sitio libre gana el MÁS CERCANO, sea el orden que sea", () => {
    const a = unTic({ fuentes: [lejos, cerca], ojoDelJugador: ojo });
    assert.equal(a.dueño, "cerca");
    assert.equal(a.tipo, 11);
    // Y al revés, porque si el orden decidiera, el resultado sería del orden
    // del `.bsp` y no de la distancia.
    const b = unTic({ fuentes: [cerca, lejos], ojoDelJugador: ojo });
    assert.equal(b.dueño, "cerca");
    assert.equal(b.tipo, 11);
  });

  test("Y SE LO QUITA AL DUEÑO: el `goto` no protege a nadie", () => {
    // ESTA PRUEBA NACIÓ AL REVÉS, exigiendo que el dueño aguantara, y salió
    // roja con el código bien. La lectura falsa era mía: `goto
    // env_sound_Think_fast` sale del `Think` de esa entidad, no del reparto, y
    // el `env_sound` de al lado llega igual a la rama de contienda. Se deja
    // escrito porque el motivo del error —un `goto` por entidad leído como un
    // `continue` del bucle de todas— no se deduce de ninguna línea suelta.
    const estado = { dueño: "lejos", rango: 100, tipoDelDueño: 23, tipo: 23, cambios: 0 };
    const r = unTic({ fuentes: [lejos, cerca], ojoDelJugador: ojo, estado });
    assert.equal(r.dueño, "cerca", "el dueño aguantó teniendo a otro más cerca");
    assert.equal(r.tipo, 11);
    assert.equal(r.cambios, 1);
  });

  test("pero el que está MÁS LEJOS que el dueño no entra", () => {
    // El control positivo del de arriba: si «gana el más cercano» se hubiera
    // portado como «gana el último que alcance», éste saldría rojo. Sin él,
    // el verde de arriba lo daría igual una regla que no compara nada.
    const estado = { dueño: "cerca", rango: 10, tipoDelDueño: 11, tipo: 11, cambios: 0 };
    const r = unTic({ fuentes: [cerca, lejos], ojoDelJugador: ojo, estado });
    assert.equal(r.dueño, "cerca");
    assert.equal(r.tipo, 11);
    assert.equal(r.cambios, 0);
  });

  test("y en cuanto el dueño deja de alcanzar, el otro entra", () => {
    // El dueño se queda sin alcance (radio 0) y el cercano se lo queda. Hacen
    // falta DOS tics y eso es del motor: el primero suelta el sitio, el
    // segundo lo reparte.
    const dueñoCorto = { ...lejos, radio: 0 };
    let estado = { dueño: "lejos", rango: 100, tipoDelDueño: 23, tipo: 23, cambios: 0 };
    estado = unTic({ fuentes: [dueñoCorto, cerca], ojoDelJugador: ojo, estado });
    estado = unTic({ fuentes: [dueñoCorto, cerca], ojoDelJugador: ojo, estado });
    assert.equal(estado.dueño, "cerca");
    assert.equal(estado.tipo, 11);
  });

  test("SALIRSE DE TODOS NO APAGA LA REVERBERACIÓN: te la llevas puesta", () => {
    // Las dos NOTE del motor (sound.cpp:975-980). Si esto se portara mal, al
    // salir de la taberna se iría la reverberación de golpe en vez de
    // arrastrarse hasta la siguiente sala, que es lo que hace el juego.
    let estado = unTic({ fuentes: [cerca], ojoDelJugador: ojo });
    assert.equal(estado.tipo, 11);
    const sinAlcance = { ...cerca, radio: 0 };
    for (let i = 0; i < 5; i++) estado = unTic({ fuentes: [sinAlcance], ojoDelJugador: ojo, estado });
    assert.equal(estado.tipo, 11, "se apagó la reverberación al salirse");
    assert.equal(estado.dueño, "cerca");     // sigue apuntado, pero sin rango
    assert.equal(estado.rango, 0);
  });

  test("EL DE TIPO 0 SE QUEDA CON EL RANGO CONGELADO, y es MÁS pegajoso", () => {
    // La segunda lectura mía que el control tumbó. Deduje que el de tipo 0
    // soltaría el sitio, porque el cero está en la condición de validez del
    // dueño. Pero el `else` al que cae —«wait passively»— **no pone
    // `m_flSndRange = 0`** (sound.cpp:986-990): ni refresca ni suelta.
    const apaga = { clave: "apaga", unidades: [95, 0, 0], radio: 9999, tipo: 0 };
    let estado = unTic({ fuentes: [apaga], ojoDelJugador: ojo });
    assert.equal(estado.dueño, "apaga");
    assert.equal(estado.tipo, 0, "el de tipo 0 no puso su cero");
    assert.equal(Math.round(estado.rango), 5);

    // El de tipo 23 está a 100 y el rango congelado es 5: NO entra.
    estado = unTic({ fuentes: [apaga, lejos], ojoDelJugador: ojo, estado });
    assert.equal(estado.dueño, "apaga", "el de tipo 0 soltó el sitio");
    assert.equal(estado.tipo, 0);
    assert.equal(Math.round(estado.rango), 5, "refrescó un rango que no debe refrescar");

    // Y lo que lo hace MÁS pegajoso que uno normal: el jugador se va lejísimos
    // y el de tipo 0 sigue siendo el dueño con su 5 puesto, mientras que uno
    // normal se habría soltado al salirse de su radio.
    const lejisimos = [100000, 0, 0];
    const fuera = unTic({ fuentes: [apaga], ojoDelJugador: lejisimos, estado });
    assert.equal(fuera.dueño, "apaga");
    assert.equal(Math.round(fuera.rango), 5, "el rango congelado se movió");
  });

  test("CONTROL: uno normal en el mismo sitio SÍ se suelta al salirse", () => {
    // Sin esto, el verde de arriba lo daría igual un reparto que no suelta a
    // nadie nunca. Mismo sitio, mismo radio, sólo cambia el tipo.
    const normal = { clave: "normal", unidades: [95, 0, 0], radio: 50, tipo: 13 };
    let estado = unTic({ fuentes: [normal], ojoDelJugador: ojo });
    assert.equal(estado.dueño, "normal");
    assert.ok(estado.rango > 0);
    estado = unTic({ fuentes: [normal], ojoDelJugador: [100000, 0, 0], estado });
    assert.equal(estado.rango, 0, "no soltó el sitio al salirse del radio");
    assert.equal(estado.tipoDelDueño, 0);
    assert.equal(estado.tipo, 13, "y el tipo del jugador NO se toca");
  });
});

describe("LOS ONCE DE EDANA, leídos del `.bsp`", () => {
  test("son once, con radios de verdad y dos sin declarar tipo", { skip: !hayEdana }, () => {
    const f = fuentesDeEdana();
    assert.equal(f.length, 11);
    assert.equal(f.filter((x) => !x.declaraTipo).length, 2);
    // Los radios no son todos iguales: 100, 128, 256 y 300. Si fueran iguales,
    // «gana el más cercano» no se podría distinguir de «gana el de más radio».
    assert.ok(new Set(f.map((x) => x.radio)).size >= 3);
    for (const x of f) assert.ok(x.radio > 0, "un env_sound con radio 0");
  });

  test("EN EDANA NO SE PISAN NI UNA VEZ: 0 de 55 pares", { skip: !hayEdana }, () => {
    // Esta prueba nació pidiendo lo contrario —«hay sitios donde dos le
    // alcanzan a la vez»— y salió roja. **Es la trampa del 50 un piso más
    // abajo**: Edana tiene once `env_sound`, que parecía caso de sobra para
    // medir el reparto, y resulta que en Edana el reparto NO TIENE CASO. El par
    // más cercano está a 452 unidades con radios de 128 y 128.
    //
    // O sea que ningún verde del reparto puede contarse contra Edana, y por eso
    // el de abajo entra por `deraliasewers`. Esto se queda como control: si
    // alguien toca los radios o el alcance y de pronto Edana solapa, hay que
    // enterarse.
    const f = fuentesDeEdana();
    let pisados = 0;
    for (let i = 0; i < f.length; i++) {
      for (let j = i + 1; j < f.length; j++) {
        const medio = f[i].unidades.map((v, k) => (v + f[j].unidades[k]) / 2);
        const a = alcanza({ origen: f[i].unidades, radio: f[i].radio, ojoDelJugador: medio });
        const b = alcanza({ origen: f[j].unidades, radio: f[j].radio, ojoDelJugador: medio });
        if (a.alcanza && b.alcanza) pisados++;
      }
    }
    assert.equal(pisados, 0, `Edana ya solapa en ${pisados} pares: el reparto YA tiene caso aquí`);
  });

  test("en el centro de cada uno, el dueño es él y el tipo es el suyo", { skip: !hayEdana }, () => {
    // El control que de verdad recorre los once: plantado en el origen de cada
    // uno, la distancia es 0 y tiene que ganar él. Un bucle que recorriera cero
    // pasaría en silencio, así que se cuenta y se exige la cuenta (el 69).
    const f = fuentesDeEdana();
    let comprobados = 0;
    for (const x of f) {
      const r = unTic({ fuentes: f, ojoDelJugador: x.unidades });
      assert.equal(r.dueño, x.clave, `en el centro de ${x.clave} ganó ${r.dueño}`);
      assert.equal(r.tipo, x.tipo);
      comprobados++;
    }
    assert.equal(comprobados, 11);
  });
});

describe("EL SEGUNDO CASO, porque Edana no lo tiene: `deraliasewers`", () => {
  // La defensa del 50 no es mirar mejor: es un segundo caso. El reparto sólo
  // se puede medir donde dos `env_sound` de tipo DISTINTO se solapan, y eso
  // pasa en **14 de los 23 mapas con dos o más, en 85 pares** — y en ninguno de
  // los tres portados. `deraliasewers` tiene 46 fuentes y 22 pares solapados,
  // que es el que más.
  //
  // No se porta el mapa: se le leen las entidades, que es lo que come la regla.
  const hayDeralia = existsSync(`${MAPAS}/deraliasewers.bsp`);

  const fuentesDe = (mapa) => leerEntidades(leerBsp(`${MAPAS}/${mapa}.bsp`))
    .filter((e) => e.classname === "env_sound" && origen(e))
    .map((e, i) => ({
      clave: i, unidades: origen(e), radio: Number(e.radius ?? 0), tipo: Number(e.roomtype ?? 0),
    }));

  test("tiene pares que se solapan CON TIPO DISTINTO, que es lo que hace falta", { skip: !hayDeralia }, () => {
    const f = fuentesDe("deraliasewers");
    assert.ok(f.length > 20, `sólo ${f.length} fuentes`);
    let pares = 0;
    for (let i = 0; i < f.length; i++) {
      for (let j = i + 1; j < f.length; j++) {
        if (f[i].tipo === f[j].tipo) continue;
        const d = Math.hypot(...f[i].unidades.map((v, k) => v - f[j].unidades[k]));
        if (d < f[i].radio + f[j].radio) pares++;
      }
    }
    assert.ok(pares > 0, "tampoco aquí hay caso: el reparto se queda sin medir");
  });

  test("y en el punto medio de un par gana el más cercano, no el primero", { skip: !hayDeralia }, () => {
    // El caso de verdad: un punto donde los dos alcanzan y los tipos difieren.
    // Se busca uno asimétrico —distancias distintas— porque en el punto medio
    // exacto de dos radios iguales el empate lo decide el orden y eso no mide
    // la comparación. Y se prueba en los DOS órdenes.
    const f = fuentesDe("deraliasewers");
    let medidos = 0;
    for (let i = 0; i < f.length && medidos < 3; i++) {
      for (let j = i + 1; j < f.length && medidos < 3; j++) {
        if (f[i].tipo === f[j].tipo) continue;
        // Un punto al 30 % del camino: más cerca de `i` que de `j`.
        const p = f[i].unidades.map((v, k) => v + (f[j].unidades[k] - v) * 0.3);
        const a = alcanza({ origen: f[i].unidades, radio: f[i].radio, ojoDelJugador: p });
        const b = alcanza({ origen: f[j].unidades, radio: f[j].radio, ojoDelJugador: p });
        if (!a.alcanza || !b.alcanza || a.distancia === b.distancia) continue;
        const cerca = a.distancia < b.distancia ? f[i] : f[j];
        for (const orden of [[f[i], f[j]], [f[j], f[i]]]) {
          const r = unTic({ fuentes: orden, ojoDelJugador: p });
          assert.equal(r.dueño, cerca.clave, "ganó el del orden y no el más cercano");
          assert.equal(r.tipo, cerca.tipo);
        }
        medidos++;
      }
    }
    assert.ok(medidos > 0, "no se encontró ni un par asimétrico: el reparto sigue sin medir");
  });
});
