// EL BOTÍN DE UN BICHO: por qué un jabalí no soltaba su pellejo.
//
// Lo reportó el usuario jugando en Edana. No estaba implementado —cero en los
// tres mapas horneados, 46 guiones del juego lo usan—, pero lo que hace que
// nadie lo echara de menos es DÓNDE vive la regla:
//
//   `base_monster_shared.script:228-250`, dentro de `npc_post_spawn`, que corre
//   **un segundo después de nacer**:
//
//       if !NPC_NO_DROPS
//       if( $rand(1,100) <= DROP_ITEM1_CHANCE ) { giveitem DROP_ITEM1 }
//
//   y al morir, `DropAllItems()` tira el inventario (msmonsterserver.cpp:2614).
//
// O sea que el pellejo **se sortea cuando el jabalí nace** y la muerte sólo lo
// deja caer. Quien busca en el camino de la muerte no encuentra nada que
// portar, que es exactamente lo que pasó.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { Manada, sorteoDeBotin } from "../src/play/manada.js";
import { RELACION } from "../src/bsp/razas.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const leer = (g) => modeloYAnimaciones(leerFichaNpc(SCRIPTS, g));

describe("lo que cada bicho declara, leído de su archivo", () => {
  test("el jabalí de Edana: `skin_boar` al 20 %", () => {
    // `boar_base.script:36-37`. El 20 importa: con esto puesto hacen falta
    // unos cinco jabalíes para ver un pellejo, así que «no suelta nada» puede
    // ser mala suerte — y por eso el control de abajo fija el dado.
    assert.deepEqual(leer("monsters/boar").ia.botin, [{ objeto: "skin_boar", probabilidad: 20 }]);
  });

  test("la rata: `skin_ratpelt` al 50 %", () => {
    assert.deepEqual(leer("monsters/giantrat").ia.botin,
      [{ objeto: "skin_ratpelt", probabilidad: 50 }]);
  });

  test("y el jefe jabalí de Edana lo suelta SIEMPRE: 100 %", () => {
    // El caso del borde que obliga a que la comparación sea `<` contra `p/100`
    // y no `<=`: con 100 tiene que salir en las mil tiradas.
    assert.deepEqual(leer("edana/boarboss").ia.botin,
      [{ objeto: "skin_boar_heavy", probabilidad: 100 }]);
  });

  test("un bicho que no declara nada no trae lista vacía, trae `null`", () => {
    // Distinguir «no declara» de «declara y está vacío» es lo que permite que
    // el sorteo no tenga que adivinar.
    assert.equal(leer("edana/weaponsmith").ia.botin, null);
  });

  test("`NPC_NO_DROPS` NO se lee, y eso es una decisión medida", () => {
    // Leerlo de `vars` daba `true` para los cuatro jabalíes y la rata, porque
    // `recoger` cosecha los `setvar` de TODOS los bloques incluidos, corran o
    // no — y `NPC_NO_DROPS 1` sólo existe dentro del evento `ext_no_drops`
    // (monsters/externals.script:881-884), al que no llama nadie en los 2 884
    // guiones. Habría anulado justo lo que se viene a leer.
    assert.equal(leer("monsters/boar").ia.noSuelta, undefined);
  });
});

describe("el sorteo, que es al nacer y una vez por bicho", () => {
  const BOTIN = [{ objeto: "skin_boar", probabilidad: 20 }];

  test("con el dado por debajo, cae", () => {
    assert.deepEqual(sorteoDeBotin(BOTIN, () => 0.19), ["skin_boar"]);
  });

  test("y justo por encima, no", () => {
    assert.deepEqual(sorteoDeBotin(BOTIN, () => 0.21), []);
  });

  test("el 100 % sale SIEMPRE, incluso con el dado casi en uno", () => {
    // `$rand(1,100) <= 100` es cierto para las cien caras, así que el 100 % no
    // puede fallar nunca.
    //
    // CORRECCIÓN DEL MISMO DÍA: aquí había escrito que por eso la comparación
    // es `<` contra `p/100` y no `<=`. Lo rompí a propósito —cambiando `<` por
    // `<=`— y **las 18 pruebas siguieron verdes**, porque con un dado continuo
    // en [0,1) las dos comparaciones sólo se diferencian en un punto exacto y
    // ningún dado fijo de aquí cae en él. O sea que la afirmación era mía y no
    // medida. El `<` se queda porque es el que mapea [0,1) a «p de cada 100»
    // sin contar el borde dos veces, y **no se apunta un verde por ese caso**.
    const cien = [{ objeto: "skin_boar_heavy", probabilidad: 100 }];
    assert.deepEqual(sorteoDeBotin(cien, () => 0.999999), ["skin_boar_heavy"]);
  });

  test("CONTROL NEGATIVO: el 0 % no sale nunca, ni con el dado a cero", () => {
    assert.deepEqual(sorteoDeBotin([{ objeto: "x", probabilidad: 0 }], () => 0), []);
  });

  test("son cinco tiradas INDEPENDIENTES, no una elección entre cinco", () => {
    // Siete guiones declaran `DROP_ITEM2` además del primero, y el mod les hace
    // un `if` a cada uno: pueden caer los dos.
    const dos = [
      { objeto: "a", probabilidad: 50 },
      { objeto: "b", probabilidad: 50 },
    ];
    assert.deepEqual(sorteoDeBotin(dos, () => 0.1), ["a", "b"], "los dos");
    assert.deepEqual(sorteoDeBotin(dos, () => 0.9), [], "o ninguno");
  });

  test("y el reparto de mil jabalíes se parece al 20 % del archivo", () => {
    // No es una prueba del generador: es que el número del archivo llegue hasta
    // aquí. Con el dado fijo no se puede ver si el 20 se convirtió en 2 o en 80.
    let s = 7;
    const dado = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    let n = 0;
    for (let k = 0; k < 1000; k++) n += sorteoDeBotin(BOTIN, dado).length;
    assert.ok(n > 150 && n < 250, `cayeron ${n} de 1000 y el archivo dice 200`);
  });
});

// ── POR EL CAMINO DEL JUEGO ────────────────────────────────────────────────

const U = 39.37;
const JABALI = leer("monsters/boar");

function manadaDeUnJabali(azar) {
  return new Manada({
    mapa: "liso", unidadesPorMetro: U,
    razas: [["wildanimal", { odia: ["human"] }], ["human", {}]],
    modelos: [{ clave: "jabali", carpeta: "bichos/monsters_boar" }],
    colocados: [{
      clase: "msmonster_boar", script: "monsters/boar", clave: "jabali",
      nombre: "Wild Boar", hp: 20, ancho: JABALI.ancho, alto: JABALI.alto,
      parado: "idle1", andando: "walk", piel: 0,
      escena: [0, 0, 0], yaw: 0, luz: [189, 187, 144],
      hostil: true, relacion: RELACION.ODIO,
      ia: JABALI.ia,
    }],
  }, { azar });
}

describe("un jabalí de verdad, por un `Manada`", () => {
  test("nace con el pellejo encima cuando el dado lo dice", () => {
    const m = manadaDeUnJabali(() => 0.1);
    assert.deepEqual(m.instancias[0].llevaEncima, ["skin_boar"],
      "y lo lleva ANTES de que nadie lo mate");
  });

  test("CONTROL NEGATIVO: con el dado en contra nace sin nada", () => {
    const m = manadaDeUnJabali(() => 0.9);
    assert.deepEqual(m.instancias[0].llevaEncima, []);
  });

  test("al morir lo suelta, y el suceso lo dice", () => {
    const m = manadaDeUnJabali(() => 0.1);
    const r = m.matar(m.instancias[0], { quien: "jugador" });
    assert.deepEqual(r.suelta, ["skin_boar"]);
    const s = m.sucesos.find((x) => x.que === "muere");
    assert.deepEqual(s.suelta, ["skin_boar"], "y viaja en el suceso, que es por donde va con servidor");
  });

  test("y matándolo por `herir`, que es como lo mata el juego", () => {
    // El 59: si esta prueba llamara sólo a `matar`, el camino que el jugador
    // recorre —pegarle hasta que se muere— podría no llevar el botín.
    const m = manadaDeUnJabali(() => 0.1);
    const i = m.instancias[0];
    const r = m.herir(i, i.vida + 1, { tipo: "slash", ahora: 0, dados: { quien: "jugador" } });
    assert.equal(r.muerto, true);
    assert.deepEqual(r.suelta, ["skin_boar"]);
  });

  test("UN CADÁVER NO DA SU PELLEJO DOS VECES", () => {
    const m = manadaDeUnJabali(() => 0.1);
    const i = m.instancias[0];
    m.matar(i, { quien: "jugador" });
    assert.deepEqual(i.llevaEncima, [], "se vacía al soltarlo");
    // Y el segundo intento no puede repetirlo: `matar` sale en la primera línea
    // si ya está muerto, pero se comprueba igual porque es el fallo que un
    // cadáver reabierto produciría.
    const otra = m.matar(i, { quien: "jugador" });
    assert.deepEqual(otra.suelta ?? [], []);
  });

  test("y al revivir sortea de nuevo — que SÍ es lo que hace el mod", () => {
    // Esto se preguntó en voz alta, porque volver a sortear convierte un área
    // que repone en una fábrica de pellejos. Y la respuesta del mod es que sí,
    // y se puede citar:
    //
    //     { game_spawn
    //         callevent npc_spawn
    //         callevent 1.0 npc_post_spawn        base_npc.script:20-25
    //
    // `npc_post_spawn` es quien tira el dado, y cuelga de `game_spawn`, que
    // corre cuando una entidad APARECE. Un `msarea_monsterspawn` no resucita al
    // mismo bicho: crea otro, así que vuelve a pasar por ahí.
    //
    // O sea que el farmeo existe en el original. Y hay una confirmación
    // bonita de que los autores lo sabían: el único sitio del mod que apaga el
    // botín es el evento `ext_no_drops`, cuyo comentario dice «add param to
    // remove drops for **exploitable** monsters» — un interruptor manual para
    // este problema exacto, que además no llama nadie. Se porta con el fallo.
    const m = manadaDeUnJabali(() => 0.1);
    const i = m.instancias[0];
    m.matar(i, { quien: "jugador" });
    m.revivir(i);
    assert.deepEqual(i.llevaEncima, ["skin_boar"]);
  });

  test("CONTROL DEL 50: el sorteo NO se repite al morir", () => {
    // Si la tirada estuviera en la muerte en vez de en el nacimiento, este
    // jabalí —nacido con el dado en contra— soltaría pellejo igualmente en
    // cuanto el dado cambiara. Es la diferencia que da nombre al experimento.
    const m = manadaDeUnJabali(() => 0.9);
    const i = m.instancias[0];
    m.azar = () => 0.01;                       // el dado, ahora a favor
    const r = m.matar(i, { quien: "jugador" });
    assert.deepEqual(r.suelta, [], "nació sin pellejo y no lo gana al morir");
  });
});
