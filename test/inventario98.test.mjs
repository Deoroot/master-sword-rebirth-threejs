// QUÉ CONTENEDOR, CUÁNTO CABE Y «DROP SELECTED» — experimento 98.
//
// Por dónde entra cada cosa (el 59: nada de construirle a la regla lo que el
// juego le pasa):
//
//   - La regla de cada contenedor sale del CATÁLOGO horneado (`npm run
//     objetos`, `ficha.contenedor`), y se compara con lo que calcula el
//     intérprete de guiones corriendo el `game_spawn` de verdad del contenedor
//     (`registercontainer`, src/play/guion.js).
//   - El personaje sale de `crearPersonaje` con el `nuevoPersonaje` del
//     catálogo (los cuatro contenedores gratis y las siete armas de partida), o
//     de `fabricar()` de tools/personaje.mjs (Veteran).
//   - Las órdenes son las del `Equipo` de src/play/equipar.js, que es lo que
//     llaman el panel y la `q` (`moverEquipo` de src/main.js).
//   - Con servidor, `Partida.recibir` con el mensaje que manda el cliente.
//
// Ver doc/INVENTARIO_98.md.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { crearPersonaje } from "../src/juego/personaje.js";
import { GuionesDeObjeto, GuionDeObjeto, QUIEN_VISTE } from "../src/play/guionobjeto.js";
import { Equipo } from "../src/play/equipar.js";
import { contenedoresDe, buscarContenedor, cabe, colocar, dentroDe, noCabeTexto } from "../src/play/contenedores.js";
import { fabricar } from "../tools/personaje.mjs";
import { MENSAJE } from "../src/red/protocolo.js";
import { Partida } from "../src/red/partida.js";
import { ClienteDeRed } from "../src/red/cliente.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";

const OBJ = "build/msr/objetos.json";
const GUIONES = "build/msr/objetosguion.json";
const hay = existsSync(OBJ);
const hayGuiones = existsSync(GUIONES);
const leer = (f) => JSON.parse(readFileSync(f, "utf8"));
const catalogo = hay ? leer(OBJ) : null;
const lista = catalogo?.objetos ?? [];
const porId = new Map(lista.map((o) => [o.id, o]));
const fichaDe = (id) => porId.get(id) ?? null;
const NUEVO = catalogo?.nuevoPersonaje ?? null;
const sin = !hay && "falta build/msr/objetos.json (npm run objetos)";

/** Un personaje nuevo de verdad, con el arma de partida en la mano. */
const nuevo = (arma = "swords_rsword") => crearPersonaje({ nombre: "Ana", arma, nuevoPersonaje: NUEVO, ahora: "2026-10-03T00:00:00.000Z" });

/** Las órdenes, como `moverEquipo`: un `Equipo` nuevo por orden. */
function jugar(p, { azar = () => 0 } = {}) {
  const dicho = [];
  let activa = "derecha";
  const orden = (hacer) => {
    const eq = new Equipo({ personaje: p, fichaDe, decir: (tipo, texto) => dicho.push({ tipo, texto }), activa, azar });
    const r = hacer(eq);
    activa = eq.activa;
    return { ...r, diario: eq.diario, sinSitio: eq.sinSitio };
  };
  return { p, dicho, orden, dijo: (t) => dicho.some((d) => d.texto === t), get activa() { return activa; } };
}
const entradaDe = (p, id) => p.objetos.find((o) => o.id === id) ?? null;

// ════════════════════════════════════════════════════════════════════════════
describe("LA REGLA DE CADA CONTENEDOR, horneada (`registercontainer`, gipack.cpp:50-77)", { skip: sin }, () => {
  test("los 22 contenedores la traen, y lo que no es contenedor no", () => {
    const cajas = lista.filter((o) => o.tipo === "contenedor");
    assert.equal(cajas.length, 22);
    assert.ok(cajas.every((o) => o.contenedor && Array.isArray(o.contenedor.acepta)), cajas.filter((o) => !o.contenedor).map((o) => o.id).join());
    assert.ok(lista.filter((o) => o.tipo !== "contenedor").every((o) => o.contenedor === null));
  });

  test("las cuatro de partida, con su número y su cita", () => {
    // sheath_belt_holster.script:7,10 · sheath_back.script:7,10 · sheath_dagger.script:6,9 · pack_sack.script:15,18
    assert.deepEqual(fichaDe("sheath_belt_holster").contenedor, { maximo: 2, acepta: ["axes", "blunt"], rechaza: ["item_tk_"], sinPeso: false });
    assert.deepEqual(fichaDe("sheath_back").contenedor, { maximo: 1, acepta: ["swords", "polearms"], rechaza: ["item_tk_"], sinPeso: false });
    assert.deepEqual(fichaDe("sheath_dagger").contenedor, { maximo: 1, acepta: ["smallarms"], rechaza: ["item_tk_"], sinPeso: false });
    assert.deepEqual(fichaDe("pack_sack").contenedor.acepta, []);
    assert.deepEqual(fichaDe("pack_sack").contenedor.rechaza, ["arrow", "axes", "blunt", "bolts", "swords", "bows", "armor", "pack", "polearms"]);
    // El `CONTAINER_SPACE 10` del saco no lo lee nadie (gipack.cpp:57-60): tope 8 OBJETOS.
    assert.equal(fichaDe("pack_sack").contenedor.maximo, 8);
  });

  test("el intérprete, corriendo el `game_spawn` del contenedor, dice lo mismo que el horneado (los que tienen guion)", { skip: !hayGuiones && "falta objetosguion.json" }, () => {
    const guiones = new GuionesDeObjeto(leer(GUIONES));
    const comparados = [];
    for (const f of lista.filter((o) => o.tipo === "contenedor")) {
      if (!guiones.tiene(f.id)) continue;
      const e = new GuionDeObjeto({ guiones, id: f.id, jugador: null, ahora: () => 0, suceso: () => {} });
      e.arrancar({ genero: "male", quien: QUIEN_VISTE.CARGA, viste: false, puesto: false });
      const { sinPeso, ...horneado } = f.contenedor;
      assert.deepEqual(e.contenedor, horneado, f.id);
      comparados.push(f.id);
    }
    // CONTROL POSITIVO: que la comparación no recorra cero (el 69).
    assert.ok(comparados.length >= 15, `sólo ${comparados.length}: ${comparados.join(", ")}`);
    assert.ok(comparados.includes("sheath_back_holster"), "el de los `setvar` (sheath_back_holster.script:5-10) tiene que estar");
  });

  test("`groupable <n>` (genericitem.cpp:1846-1863): las flechas se apilan, la espada no", () => {
    assert.equal(fichaDe("proj_arrow_wooden").apilable, true);
    assert.equal(fichaDe("proj_arrow_wooden").apilableHasta, 25);
    assert.equal(fichaDe("item_lockpick").apilableHasta, 100);
    assert.equal(fichaDe("swords_rsword").apilable, false);
    assert.ok(lista.filter((o) => o.apilable).length >= 64, "64 guiones lo escriben");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("QUÉ CONTENEDOR: la `q` con las armas de partida de un personaje nuevo", { skip: sin }, () => {
  // `UseItem` -> `PutInAnyPack` -> `FindPackForItem` (genericitem.cpp:1154-1197).
  const casos = [
    // `swords` pide «sheath»: el PRIMERO con «sheath» es sheath_belt_holster, que no la admite; vuelta -> Back Sword Sheath.
    ["swords_rsword", "Rusty Short Sword", "sheath_back", "Back Sword Sheath"],
    // `axes` pide «holster»: sheath_belt_holster, que sí.
    ["axes_rsmallaxe", "Rusted Axe", "sheath_belt_holster", "Heavy Weapon Holster"],
    ["blunt_hammer1", "Training Hammer", "sheath_belt_holster", "Heavy Weapon Holster"],
    // `smallarms` no tiene nombre en `FindPackForItem`: vuelta, y la primera que la admite.
    ["smallarms_rknife", "Dull Knife", "sheath_dagger", "Dagger Sheath"],
    // `polearms` tampoco: la Back Sword Sheath lo acepta (`swords;polearms`).
    ["polearms_qs", "Quarterstaff", "sheath_back", "Back Sword Sheath"],
  ];
  for (const [arma, nombre, caja, nombreCaja] of casos) {
    test(`${arma} -> ${nombreCaja}`, () => {
      const j = jugar(nuevo(arma));
      const r = j.orden((eq) => eq.usar("derecha"));
      assert.equal(r.que, "guardado", JSON.stringify(r));
      assert.equal(r.en, caja);
      assert.equal(entradaDe(j.p, arma).en, caja);
      assert.ok(j.dijo(`You put ${nombre} in ${nombreCaja}`), JSON.stringify(j.dicho));
      assert.equal(j.p.manos.derecha, null);
    });
  }
  test("el Tree Bow no cabe en NINGUNO de los cuatro: la `q` se calla y se queda en la mano", () => {
    // `if (Verbose && !CanPutinInventory()) return false;` (genericitem.cpp:991-
    // 992): ni se viste ni `FindPackForItem` encuentra sitio, y sale SIN
    // mensaje. El «won't fit into any of your packs» es de `PutInAnyPack`
    // (playershared.cpp:726-731), y por la `q` no se llega a él.
    const j = jugar(nuevo("bows_treebow"));
    const r = j.orden((eq) => eq.usar("derecha"));
    assert.equal(r.hecho, false);
    assert.equal(j.p.manos.derecha, "bows_treebow");
    assert.deepEqual(j.dicho, []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("EL CENSO: dónde cae cada objeto del catálogo con los cuatro contenedores de partida vacíos", { skip: sin }, () => {
  test("se cuenta, y suma el catálogo", () => {
    const p = nuevo();
    p.manos.derecha = null;
    const cuenta = new Map();
    const objetos = lista.filter((o) => o.tipo !== "contenedor");
    for (const o of objetos) {
      const c = buscarContenedor(p, { id: o.id, n: 1 }, fichaDe);
      const k = c?.nombre ?? "(ninguno)";
      cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
    }
    console.log(`        ${[...cuenta].map(([k, n]) => `${k} ${n}`).join(" · ")} — de ${objetos.length}`);
    assert.equal([...cuenta.values()].reduce((a, b) => a + b, 0), objetos.length);
    // Las cuatro reciben algo y hay objetos que no caben en ninguna.
    for (const k of ["Heavy Weapon Holster", "Back Sword Sheath", "Dagger Sheath", "Small Sack", "(ninguno)"]) assert.ok(cuenta.get(k) > 0, k);
    // Los hechizos, en ninguna (`CanPutInPack`, genericitem.cpp:1235-1236).
    assert.equal(buscarContenedor(p, { id: "magic_hand_lightning_weak", n: 1 }, fichaDe), null);
    // Las armaduras, en ninguna: el saco rechaza `armor`.
    assert.equal(buscarContenedor(p, { id: "armor_leather", n: 1 }, fichaDe), null);
    // La flecha, en ninguna: no hay carcaj y el saco rechaza `arrow`.
    assert.equal(buscarContenedor(p, { id: "proj_arrow_wooden", n: 1 }, fichaDe), null);
    // Y la manzana, al saco.
    assert.equal(buscarContenedor(p, { id: "health_apple", n: 1 }, fichaDe)?.id, "pack_sack");
  });

  test("`bolts` no es `bolt`: el saco rechaza «bolts» y por eso un virote SÍ entra (pack_sack.script:18)", () => {
    const p = nuevo();
    assert.equal(buscarContenedor(p, { id: "proj_bolt_wooden", n: 1 }, fichaDe)?.id, "pack_sack");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("CUÁNTO CABE (`Container_CanAcceptItem`, gipack.cpp:247-331)", { skip: sin }, () => {
  test("la Back Sword Sheath tiene tope 1: la segunda espada se queda SIN SITIO, y llevarla a la funda dice que no cabe", () => {
    const j = jugar(nuevo("swords_rsword"));
    j.orden((eq) => eq.usar("derecha"));                    // la Rusty a la funda de espalda
    j.p.objetos.push({ id: "swords_novablade12", n: 1 });   // llega otra espada (el suelo, la tienda)
    const r0 = j.orden(() => ({}));
    assert.deepEqual(r0.sinSitio.map((o) => o.id), ["swords_novablade12"]);
    assert.equal(entradaDe(j.p, "swords_novablade12").en, undefined);
    j.orden((eq) => eq.aLaMano("swords_novablade12", "transfer"));
    assert.equal(j.p.manos.derecha, "swords_novablade12");
    j.dicho.length = 0;
    // El panel: elegirla en las manos y pulsar la funda (`inv transfer <id> <c>`).
    const r = j.orden((eq) => eq.guardarEn("derecha", "sheath_back"));
    assert.equal(r.hecho, false);
    assert.ok(j.dijo("Your Back Sword Sheath can't fit that!"), JSON.stringify(j.dicho));
    assert.equal(j.p.manos.derecha, "swords_novablade12");
    // `PutInPack` falla ANTES de `game_putinpack` (genericitem.cpp:1243-1250).
    assert.ok(!r.diario.some((d) => d.endsWith("game_putinpack")), JSON.stringify(r.diario));
    // Y CONTROL POSITIVO: con la funda de espalda VACÍA (la Rusty en la mano,
    // sin guardar), la misma Novablade que llega se coloca en ella. Lo que la
    // dejaba sin sitio era el tope y no otra cosa.
    const k = jugar(nuevo("swords_rsword"));
    k.p.objetos.push({ id: "swords_novablade12", n: 1 });
    assert.deepEqual(k.orden(() => ({})).sinSitio, []);
    assert.equal(entradaDe(k.p, "swords_novablade12").en, "sheath_back");
  });

  test("las DOS frases del no cabe, a cara o cruz (`RANDOM_LONG(0, 1)`, playershared.cpp:681-684)", () => {
    for (const [azar, frase] of [[0, "Your Heavy Weapon Holster can't fit that!"],
      [0.9, "You try to stuff Rusty Short Sword into your Heavy Weapon Holster, but to no avail."]]) {
      const j = jugar(nuevo("swords_rsword"), { azar: () => azar });
      const r = j.orden((eq) => eq.guardarEn("derecha", "sheath_belt_holster"));
      assert.equal(r.hecho, false);
      assert.ok(j.dijo(frase), JSON.stringify(j.dicho));
    }
    assert.equal(noCabeTexto("X", "Y", () => 0.49), "Your Y can't fit that!");
    assert.equal(noCabeTexto("X", "Y", () => 0.5), "You try to stuff X into your Y, but to no avail.");
  });

  test("el Heavy Weapon Holster admite DOS: la tercera hacha no", () => {
    const j = jugar(nuevo("axes_rsmallaxe"));
    j.p.objetos.push({ id: "axes_rsmallaxe", n: 1 }, { id: "blunt_hammer1", n: 1 });
    j.orden(() => ({}));                                    // se colocan las dos
    assert.deepEqual(dentroDe(j.p, "sheath_belt_holster").map((o) => o.id), ["axes_rsmallaxe", "blunt_hammer1"]);
    const r = j.orden((eq) => eq.guardarEn("derecha", "sheath_belt_holster"));
    assert.equal(r.hecho, false);
    assert.ok(j.dijo("Your Heavy Weapon Holster can't fit that!"));
    // CONTROL POSITIVO: con una dentro, la segunda entra.
    const k = jugar(nuevo("axes_rsmallaxe"));
    k.p.objetos.push({ id: "blunt_hammer1", n: 1 });
    assert.equal(k.orden((eq) => eq.guardarEn("derecha", "sheath_belt_holster")).que, "guardado");
  });

  test("LLENO PERO AGRUPABLE: entra si ya hay un montón del mismo guion dentro, y ANTES de mirar las máscaras (gipack.cpp:256-285)", () => {
    const p = nuevo();
    p.manos.derecha = null;
    const saco = contenedoresDe(p, fichaDe).find((c) => c.id === "pack_sack");
    // Siete manzanas y un montón de ganzúas: ocho, lleno.
    for (let i = 0; i < 7; i++) p.objetos.push({ id: "health_apple", n: 1, en: "pack_sack" });
    p.objetos.push({ id: "item_lockpick", n: 3, en: "pack_sack" });
    assert.equal(cabe(p, saco, { id: "item_lockpick", n: 1 }, fichaDe), true);
    // CONTROL: lleno con ocho manzanas, la ganzúa no.
    const q = nuevo();
    for (let i = 0; i < 8; i++) q.objetos.push({ id: "health_apple", n: 1, en: "pack_sack" });
    const saco2 = contenedoresDe(q, fichaDe).find((c) => c.id === "pack_sack");
    assert.equal(cabe(q, saco2, { id: "item_lockpick", n: 1 }, fichaDe), false);
    // Y una manzana más tampoco: no es agrupable.
    assert.equal(cabe(q, saco2, { id: "health_apple", n: 1 }, fichaDe), false);
  });

  test("`accept` manda sobre `reject` (gipack.cpp:308-310) y `reject all` lo rechaza todo (:293-294)", () => {
    const p = nuevo();
    p.objetos.push({ id: "pack_boh", n: 1 }, { id: "pack_archersquiver", n: 1 });
    const boh = contenedoresDe(p, fichaDe).find((c) => c.id === "pack_boh");
    const carcaj = contenedoresDe(p, fichaDe).find((c) => c.id === "pack_archersquiver");
    assert.equal(cabe(p, boh, { id: "health_apple", n: 1 }, fichaDe), false);
    // El carcaj del arquero acepta `bows`: un arco entra aunque no sea flecha.
    assert.equal(cabe(p, carcaj, { id: "bows_treebow", n: 1 }, fichaDe), true);
    assert.equal(cabe(p, carcaj, { id: "health_apple", n: 1 }, fichaDe), false);
  });

  test("DE UN CONTENEDOR A OTRO, y al MISMO dice que no cabe (`ItemExists`, genitemlist.cpp:9-11)", () => {
    const j = jugar(nuevo());
    j.p.objetos.push({ id: "pack_heavybackpack", n: 1 }, { id: "health_apple", n: 1 });
    j.orden(() => ({}));
    assert.equal(entradaDe(j.p, "health_apple").en, "pack_sack");
    j.dicho.length = 0;
    const r1 = j.orden((eq) => eq.moverA("health_apple", "pack_sack"));
    assert.equal(r1.hecho, false);
    assert.ok(j.dijo("Your Small Sack can't fit that!"), JSON.stringify(j.dicho));
    const r2 = j.orden((eq) => eq.moverA("health_apple", "pack_heavybackpack"));
    assert.equal(r2.que, "movido");
    assert.equal(entradaDe(j.p, "health_apple").en, "pack_heavybackpack");
    assert.ok(j.dijo("You put Apple in Heavy Backpack"));
    assert.deepEqual(r2.diario, ["health_apple:game_putinpack", "health_apple:game_removefromowner"]);
    // Y la espada a un contenedor que no la admite: no se mueve.
    const r3 = j.orden((eq) => eq.moverA("health_apple", "sheath_dagger"));
    assert.equal(r3.hecho, false);
    assert.equal(entradaDe(j.p, "health_apple").en, "pack_heavybackpack");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("VETERAN (tools/personaje.mjs) colocado", { skip: sin }, () => {
  test("hacha a la funda, Fire Blade a la de daga, y el Phoenix Bow SIN SITIO (en el juego no podría llevarlo)", () => {
    const p = fabricar({ nombre: "Veteran", ahora: "2026-10-03T00:00:00.000Z" });
    const sinSitio = colocar(p, fichaDe);
    assert.equal(entradaDe(p, "axes_dragon").en, "sheath_belt_holster");
    assert.equal(entradaDe(p, "smallarms_k_fire").en, "sheath_dagger");
    assert.deepEqual(sinSitio.map((o) => o.id), ["bows_firebird"]);
    // Lo puesto y los contenedores no llevan `en`.
    assert.ok(p.objetos.filter((o) => o.puesto || fichaDe(o.id)?.tipo === "contenedor").every((o) => o.en === undefined));
    // Idempotente: otra pasada no mueve nada.
    const antes = JSON.stringify(p.objetos);
    colocar(p, fichaDe);
    assert.equal(JSON.stringify(p.objetos), antes);
  });
});

// ════════════════════════════════════════════════════════════════════════════
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

describe("«DROP SELECTED» con servidor: `SOLTAR` con `desde: \"mochila\"`", () => {
  test("el cliente lo manda con `desde`; sin él, el de la mano (el 97)", () => {
    const c = Object.create(ClienteDeRed.prototype);
    const mandados = [];
    c._mandar = (t, m) => mandados.push([t, m]);
    c.soltarArma("health_apple", "mochila");
    c.soltarArma("swords_rsword");
    assert.deepEqual(mandados, [[MENSAJE.SOLTAR, { id: "health_apple", desde: "mochila" }], [MENSAJE.SOLTAR, { id: "swords_rsword" }]]);
  });

  test("el servidor quita UNA de su lista; lo puesto, un contenedor o lo que no lleva da FALLO", async () => {
    const partida = new Partida({ mundo: await mundoLiso(), almacen: new AlmacenMemoria(), aparicion: APARICION, catalogo: catalogo ?? undefined });
    const b = buzon();
    const c = partida.conectar(b, { nombre: "Uno" });
    await partida.recibir(c.id, { t: MENSAJE.CREAR, personaje: { nombre: "Uno", arma: "swords_rsword" } });
    await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: b.ultimo(MENSAJE.LISTA).personajes[0].id });
    const p = c.sesion.personaje;
    p.objetos.push({ id: "health_apple", n: 2 }, { id: "armor_leather", n: 1, puesto: true });
    const manzanas = () => p.objetos.filter((o) => o.id === "health_apple").reduce((s, o) => s + (o.n ?? 1), 0);
    await partida.recibir(c.id, { t: MENSAJE.SOLTAR, id: "health_apple", desde: "mochila" });
    assert.equal(manzanas(), 1);
    await partida.recibir(c.id, { t: MENSAJE.SOLTAR, id: "health_apple", desde: "mochila" });
    assert.equal(manzanas(), 0);
    await partida.recibir(c.id, { t: MENSAJE.SOLTAR, id: "health_apple", desde: "mochila" });
    assert.match(b.ultimo(MENSAJE.FALLO)?.porque ?? "", /not carrying health_apple/);
    const fallos = () => b.dentro.filter((m) => m.t === MENSAJE.FALLO).length;
    const f0 = fallos();
    await partida.recibir(c.id, { t: MENSAJE.SOLTAR, id: "armor_leather", desde: "mochila" });
    assert.equal(fallos(), f0 + 1, "lo puesto no se suelta así");
    assert.ok(p.objetos.some((o) => o.id === "armor_leather"));
    if (hay && p.objetos.some((o) => o.id === "pack_sack")) {
      await partida.recibir(c.id, { t: MENSAJE.SOLTAR, id: "pack_sack", desde: "mochila" });
      assert.equal(fallos(), f0 + 2, "un contenedor tampoco");
    }
    // Y la mano no se ha tocado en todo esto.
    assert.equal(p.manos.derecha, c.sesion.personaje.manos.derecha);
  });
});
