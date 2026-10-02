// LAS ÁREAS DE APARICIÓN, y los 38 bichos de Gate City que no estaban donde
// creíamos.
//
// Lo que estas pruebas defienden es un número: **38 de las 69 entidades de bicho
// del mapa son fichas de un área, no monstruos de pie**. Colocarlas las 69 al
// arrancar se ve casi bien —están en el mismo sitio, porque ninguna área de Gate
// City sortea el sitio— y esconde las dos cosas que sí se notan: que a los 3
// segundos no estaban, y que al matarlos vuelven.
//
// Cada regla con su cita, y los dos valores por omisión que se leen al revés si
// uno se fía del sentido común: **cero vidas es infinitas**
// (msmonsterserver.cpp:202) y **la primera aparición no espera**
// (msmapents.cpp:1092).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  Aparecedor, delCenso, PRIMER_PENSAMIENTO, ENTRE_APARICIONES, INFINITAS,
} from "../src/play/aparecer.js";

/** Un dado que no es dado: siempre el punto medio. */
const medio = () => 0.5;

const unArea = (extra = {}) => ({ nombre: "a1", deGolpe: true, ...extra });

describe("el reloj de un área", () => {
  test("no aparece nada antes de los 3 segundos, y a los 3 sí", () => {
    const a = new Aparecedor({
      areas: [unArea()],
      plantillas: [{ id: 7, area: "a1", vidas: INFINITAS, esperaMin: 10, esperaMax: 10, probabilidad: 100 }],
      azar: medio,
    });
    assert.equal(a.estaPuesto(7), false, "al arrancar no está en el mundo");
    // **Los 2,95 van a mano y no como `PRIMER_PENSAMIENTO - 0.05`.** Escrito con
    // la constante, el bucle se mueve con ella: poniendo la constante a cero la
    // prueba seguía verde y el pueblo aparecía lleno al entrar. Un control que se
    // mide contra sí mismo no mide nada, y éste lo hizo hasta que lo falsifiqué.
    assert.equal(PRIMER_PENSAMIENTO, 3.0, "msmapents.cpp:744 dice ltime + 3.0");
    let sucesos = [];
    for (let t = 0; t < 2.95; t += 1 / 20) sucesos = sucesos.concat(a.tic(1 / 20));
    assert.deepEqual(sucesos, [], `algo ha aparecido antes de los 3 s: ${JSON.stringify(sucesos)}`);
    assert.equal(a.estaPuesto(7), false);
    // Y en el paso que cruza los 3 s, aparece.
    const s = [];
    for (let k = 0; k < 4; k++) s.push(...a.tic(1 / 20));
    assert.equal(s.length, 1, `esperaba una aparición y hay ${s.length}`);
    assert.deepEqual(s[0], { que: "aparece", id: 7, area: "a1" });
    assert.equal(a.estaPuesto(7), true);
  });

  test("la PRIMERA aparición no espera, aunque la espera sea de cinco minutos", () => {
    // «Monsters now spawn immediately the FIRST time. The respawn delay only
    // affects respawns... not first spawns.» msmapents.cpp:1092-1094. Los goblins
    // de Gate City esperan de 300 a 500 s entre vidas: si esa espera contara la
    // primera vez, el pueblo estaría vacío los primeros cinco minutos.
    const a = new Aparecedor({
      areas: [unArea()],
      plantillas: [{ id: 0, area: "a1", vidas: INFINITAS, esperaMin: 300, esperaMax: 500, probabilidad: 100 }],
      azar: medio,
    });
    for (let t = 0; t < 4; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.estaPuesto(0), true);
    assert.equal(a.fichaDe(0).apariciones, 1);
  });

  test("uno cada 0,2 s, y no los diez de golpe", () => {
    // `flNextSpawnTime = gpGlobals->time + 0.2` (:1213). Un área con diez fichas
    // —`spawners6` tiene cinco, `spawners8` cuatro— no las suelta todas en el
    // mismo fotograma.
    const plantillas = Array.from({ length: 10 }, (v, k) =>
      ({ id: k, area: "a1", vidas: INFINITAS, esperaMin: 0, esperaMax: 0, probabilidad: 100 }));
    const a = new Aparecedor({ areas: [unArea()], plantillas, azar: medio });
    // Justo después de cruzar los 3 s: uno solo.
    const s = [];
    for (let t = 0; t <= 3.0; t += 1 / 20) s.push(...a.tic(1 / 20));
    assert.equal(s.length, 1, `de golpe han salido ${s.length}`);
    // Y en tres segundos más, los diez: 0,2 s cada uno. Se deja holgura porque
    // el paso de 1/20 no cae exacto sobre los 0,2 y a veces hacen falta cinco
    // tics en vez de cuatro — lo que se mide es el RITMO, no el fotograma.
    for (let k = 0; k < 20; k++) s.push(...a.tic(1 / 20));   // 1 s: unos cinco
    assert.ok(s.length >= 4 && s.length <= 7, `al segundo hay ${s.length}, esperaba ~5`);
    for (let k = 0; k < 40; k++) s.push(...a.tic(1 / 20));   // 2 s más: los diez
    assert.equal(s.length, 10);
    assert.equal(a.puestas, 10);
    // EL CONTROL de que el escalonado se mide de verdad: sin `spawnstart` el
    // motor NO lo respeta, y entonces sí salen los diez juntos.
    const b = new Aparecedor({
      areas: [unArea({ deGolpe: false })],
      plantillas: plantillas.map((p) => ({ ...p })),
      azar: medio,
    });
    const sb = [];
    for (let t = 0; t <= 3.0; t += 1 / 20) sb.push(...b.tic(1 / 20));
    assert.equal(sb.length, 10, "sin spawnstart tenían que salir los diez juntos");
  });
});

describe("las vidas, y el valor por omisión que se lee al revés", () => {
  test("CERO vidas es INFINITAS: vuelve siempre", () => {
    // `if (!m_Lives) m_Lives = -1; //zero == infinite lives`
    // (msmonsterserver.cpp:202-203). Es el caso de 16 de las 38 de Gate City, o
    // sea que leerlo como «no vuelve» vacía el pueblo y tarda en notarse.
    const a = new Aparecedor({
      areas: [unArea()],
      plantillas: [{ id: 3, area: "a1", vidas: INFINITAS, esperaMin: 10, esperaMax: 10, probabilidad: 100 }],
      azar: medio,
    });
    for (let t = 0; t < 4; t += 1 / 20) a.tic(1 / 20);
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      assert.equal(a.estaPuesto(3), true, `vuelta ${vuelta}`);
      assert.equal(a.muerto(3), true, "con vidas infinitas siempre vuelve");
      assert.equal(a.estaPuesto(3), false);
      // No vuelve antes de su espera de 10 s...
      for (let t = 0; t < 9.5; t += 1 / 20) a.tic(1 / 20);
      assert.equal(a.estaPuesto(3), false, "ha vuelto antes de tiempo");
      // ...y vuelve después.
      for (let t = 0; t < 1.5; t += 1 / 20) a.tic(1 / 20);
      assert.equal(a.estaPuesto(3), true, "no ha vuelto");
    }
    assert.equal(a.fichaDe(3).apariciones, 6);
  });

  test("una vida: sale una vez y al morir no vuelve", () => {
    // Las 22 plantillas con `lives 1`, entre ellas las cuatro bolsas de crías.
    const a = new Aparecedor({
      areas: [unArea()],
      plantillas: [{ id: 1, area: "a1", vidas: 1, esperaMin: 1, esperaMax: 2, probabilidad: 100 }],
      azar: medio,
    });
    for (let t = 0; t < 4; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.estaPuesto(1), true);
    assert.equal(a.fichaDe(1).vidasQuedan, 0, "la vida se gasta al APARECER");
    assert.equal(a.muerto(1), false, "sin vidas, no vuelve");
    for (let t = 0; t < 60; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.estaPuesto(1), false, "ha vuelto y no debía");
    assert.equal(a.fichaDe(1).apariciones, 1);
  });

  test("cinco vidas: cinco apariciones y ni una más", () => {
    const a = new Aparecedor({
      areas: [unArea()],
      plantillas: [{ id: 2, area: "a1", vidas: 5, esperaMin: 30, esperaMax: 30, probabilidad: 100 }],
      azar: medio,
    });
    for (let vuelta = 0; vuelta < 7; vuelta++) {
      for (let t = 0; t < 35; t += 1 / 20) a.tic(1 / 20);
      if (a.estaPuesto(2)) a.muerto(2);
    }
    assert.equal(a.fichaDe(2).apariciones, 5);
    assert.equal(a.fichaDe(2).agotada, true);
  });

  test("`fireallperish` cuando se acaban TODAS, y una sola vez", () => {
    // En Gate City `spawn_bowguys` lo usa para abrir `skele_treasure`: el cofre
    // del tesoro sale cuando los tres ballesteros se han quedado sin vidas.
    const a = new Aparecedor({
      areas: [unArea({ alAcabarse: "skele_treasure" })],
      plantillas: [0, 1, 2].map((k) =>
        ({ id: k, area: "a1", vidas: 1, esperaMin: 0, esperaMax: 0, probabilidad: 100 })),
      azar: medio,
    });
    for (let t = 0; t < 5; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.puestas, 3);
    a.muerto(0); a.muerto(1);
    let s = [];
    for (let t = 0; t < 2; t += 1 / 20) s = s.concat(a.tic(1 / 20));
    assert.deepEqual(s.filter((x) => x.que === "seAcaban"), [], "con uno vivo no se dispara");
    a.muerto(2);
    s = [];
    for (let t = 0; t < 2; t += 1 / 20) s = s.concat(a.tic(1 / 20));
    const disparos = s.filter((x) => x.que === "seAcaban");
    assert.equal(disparos.length, 1);
    assert.deepEqual(disparos[0], { que: "seAcaban", area: "a1", dispara: "skele_treasure" });
    // Y no otra vez.
    s = [];
    for (let t = 0; t < 10; t += 1 / 20) s = s.concat(a.tic(1 / 20));
    assert.deepEqual(s.filter((x) => x.que === "seAcaban"), []);
  });
});

describe("la probabilidad, que en Gate City nunca falla", () => {
  test("se compara contra RANDOM_FLOAT(0, 99), así que 100 pasa siempre", () => {
    // `if (RANDOM_FLOAT(0, 99) > spawnchance)` (msmapents.cpp:1214). Con el dado
    // pegado al 1 —el peor caso, 99— y probabilidad 100, tiene que aparecer.
    const a = new Aparecedor({
      areas: [unArea()],
      plantillas: [{ id: 0, area: "a1", vidas: INFINITAS, esperaMin: 0, esperaMax: 0, probabilidad: 100 }],
      azar: () => 0.999999,
    });
    for (let t = 0; t < 4; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.estaPuesto(0), true);
  });

  test("y con probabilidad 0 no aparece nunca: el camino se ejerce a mano", () => {
    // Ninguna plantilla de Gate City lo usa, así que sin esta prueba el camino
    // sería código muerto y sin comprobar. Con el dado a la mitad da 49,5 > 0.
    const a = new Aparecedor({
      areas: [unArea()],
      plantillas: [{ id: 0, area: "a1", vidas: INFINITAS, esperaMin: 5, esperaMax: 5, probabilidad: 0 }],
      azar: medio,
    });
    for (let t = 0; t < 120; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.estaPuesto(0), false);
    assert.equal(a.fichaDe(0).apariciones, 0);
    // Y el positivo: la MISMA área con probabilidad 50 y el dado a la mitad
    // (49,5 > 50 es falso) sí aparece. Sin esto, «no aparece» podría ser que el
    // área no piense siquiera.
    const b = new Aparecedor({
      areas: [unArea()],
      plantillas: [{ id: 0, area: "a1", vidas: INFINITAS, esperaMin: 5, esperaMax: 5, probabilidad: 50 }],
      azar: medio,
    });
    for (let t = 0; t < 4; t += 1 / 20) b.tic(1 / 20);
    assert.equal(b.estaPuesto(0), true);
  });
});

describe("lo que se dispara y lo que no", () => {
  test("un área con `spawntrigger` no saca nada hasta que la disparan", () => {
    const a = new Aparecedor({
      areas: [unArea({ porDisparo: true })],
      plantillas: [{ id: 0, area: "a1", vidas: INFINITAS, esperaMin: 0, esperaMax: 0, probabilidad: 100 }],
      azar: medio,
    });
    for (let t = 0; t < 60; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.estaPuesto(0), false);
    assert.equal(a.disparar("a1"), true);
    for (let t = 0; t < 4; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.estaPuesto(0), true);
  });

  test("romper la bolsa de una cría VIVA no saca otra: `resetwhen` es 0", () => {
    // `if (m_fActive) { if (!resetwhen) return; }` (msmapents.cpp:754-758). Las
    // cuatro bolsas de Gate City no dicen `resetwhen`, o sea 0: el área sólo se
    // reinicia cuando están todas muertas, y por eso aporrear la bolsa no da
    // crías infinitas.
    const a = new Aparecedor({
      areas: [unArea()],
      plantillas: [{ id: 0, area: "a1", vidas: 1, esperaMin: 1, esperaMax: 2, probabilidad: 100 }],
      azar: medio,
    });
    for (let t = 0; t < 4; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.estaPuesto(0), true);
    assert.equal(a.disparar("a1"), false, "el área activa con resetwhen 0 no se reinicia");
    assert.equal(a.fichaDe(0).apariciones, 1);
  });

  test("una plantilla sin área se cuenta, no se pierde en silencio", () => {
    // El motor avisa por consola y sigue («msarea_monsterspawn named %s NOT
    // FOUND», msmonsterserver.cpp:126): la ficha se queda sin dueño y el bicho no
    // aparece nunca. Un bicho que no existe no se ve por ninguna parte, así que
    // aquí se cuenta.
    const a = new Aparecedor({
      areas: [unArea()],
      plantillas: [{ id: 0, area: "no_existe", vidas: 1, esperaMin: 0, esperaMax: 0, probabilidad: 100 }],
      azar: medio,
    });
    assert.equal(a.huerfanas.length, 1);
    assert.equal(a.n, 0);
    // Y un bicho que NO es plantilla está puesto siempre: los 31 aldeanos.
    assert.equal(a.esPlantilla(99), false);
    assert.equal(a.estaPuesto(99), true);
  });
});

const CENSO = "build/gatecity/bichos.json";
describe("Gate City de verdad", { skip: existsSync(CENSO) ? false : `falta ${CENSO} (npm run gatecity:bichos)` }, () => {
  const censo = JSON.parse(readFileSync(CENSO, "utf8"));

  test("38 de 69 son fichas, 16 áreas, y ninguna huérfana", () => {
    const { areas, plantillas } = delCenso(censo);
    assert.equal(censo.colocados.length, 69);
    assert.equal(plantillas.length, 38);
    assert.equal(areas.length, 16);
    const a = new Aparecedor({ areas, plantillas, azar: medio });
    assert.equal(a.huerfanas.length, 0);
    assert.equal(a.n, 38);
    // Ninguna sortea el sitio: las 16 son fijas, o sea que el bicho sale donde
    // está su plantilla. Por eso la posición del censo siempre estuvo bien.
    assert.equal(areas.filter((x) => x.sorteaSitio).length, 0);
    // Y los 31 que quedan son los aldeanos y los tenderos, no plantillas.
    const dePie = censo.colocados.filter((c) => !c.aparecedor);
    assert.equal(dePie.length, 31);
    assert.ok(dePie.every((c) => /^(NPCs\/|gatecity\/)/.test(c.script ?? "")),
      `hay un monstruo de pie: ${dePie.find((c) => !/^(NPCs\/|gatecity\/)/.test(c.script ?? ""))?.script}`);
  });

  test("al entrar el pueblo está vacío de monstruos; a los 5 s están los 38", () => {
    const { areas, plantillas } = delCenso(censo);
    const a = new Aparecedor({ areas, plantillas, azar: medio });
    assert.equal(a.puestas, 0, "al arrancar no hay ni un monstruo");
    // Y a los 2,9 s TAMPOCO — el número va a mano a propósito: con la constante
    // en la cuenta, esta prueba seguía verde con la espera puesta a cero.
    for (let t = 0; t < 2.9; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.puestas, 0, "han aparecido antes de los 3 s");
    // 3 s de espera más 0,2 s por bicho y por área. El área más cargada tiene 5.
    for (let t = 0; t < 5; t += 1 / 20) a.tic(1 / 20);
    assert.equal(a.puestas, 38, `a los 5 s hay ${a.puestas} de 38`);
  });

  test("las 16 sin `lives` vuelven para siempre, y las 22 con una, no", () => {
    const { areas, plantillas } = delCenso(censo);
    assert.equal(plantillas.filter((p) => p.vidas === INFINITAS).length, 16);
    assert.equal(plantillas.filter((p) => p.vidas === 1).length, 19);
    assert.equal(plantillas.filter((p) => p.vidas === 5).length, 3);
    // Matarlos todos a los 5 s y correr una hora: vuelven exactamente las que
    // tienen vidas. 16 infinitas + 3 con cinco vidas = 19 de pie; 19 con una vida
    // se quedan fuera para siempre.
    const a = new Aparecedor({ areas, plantillas, azar: medio });
    for (let t = 0; t < 5; t += 1 / 20) a.tic(1 / 20);
    for (const p of plantillas) a.muerto(p.id);
    assert.equal(a.puestas, 0);
    for (let t = 0; t < 3600; t += 1 / 4) a.tic(1 / 4);
    assert.equal(a.puestas, 19, `tras una hora hay ${a.puestas} de pie`);
    const vueltas = plantillas.filter((p) => a.fichaDe(p.id).apariciones > 1).length;
    assert.ok(vueltas >= 19, `sólo ${vueltas} han vuelto alguna vez`);
  });

  test("las cuatro bolsas de crías: una cría cada una y se acabó", () => {
    const { areas, plantillas } = delCenso(censo);
    const bolsas = plantillas.filter((p) => /^spawn_babies/.test(p.area));
    assert.equal(bolsas.length, 4);
    for (const b of bolsas) {
      assert.equal(b.vidas, 1, `${b.area} debería tener una vida`);
      assert.equal(b.esperaMin, 1);
      assert.equal(b.esperaMax, 2);
      // Y son ARAÑAS pequeñas, no ratas: `scriptfile` manda sobre `defscriptfile`.
      assert.equal(censo.colocados[b.id].clase, "msmonster_giantrat");
    }
  });
});
