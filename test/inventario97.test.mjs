// EL 97: PONERSE Y QUITARSE ROPA JUGANDO, Y EL ARMA DE PARTIDA DUPLICADA.
//
// Por dónde entra cada cosa (el 59: nada de construirle a la regla lo que el
// juego le pasa):
//
//   - El personaje sale de `crearPersonaje` o de `fabricar()` de
//     tools/personaje.mjs —la herramienta de verdad, «Veteran»—, y los
//     personajes viejos de un documento de la VERSIÓN 1 tal como la escribía
//     el `crearPersonaje` de antes, pasado por `abrirPersonaje`.
//   - Los objetos se montan como `sincronizarObjetosVivos` de src/main.js: uno
//     por cada cosa de `loQueLleva` (lista + manos), con su guion horneado y el
//     `GuionDelJugador` de verdad de dueño.
//   - Las órdenes son las del `Equipo` de src/play/equipar.js, que es lo que
//     llaman el panel y la `q` (`moverEquipo` de main.js). Lo que se mide es el
//     EFECTO: el golpe que pasa por `defensaDelJugador` —lo que llama
//     `golpear`— y la resistencia al fuego que escribe el guion del jugador.
//
// Ver doc/INVENTARIO_97.md.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { crearPersonaje, abrirPersonaje, loQueLleva, VERSION } from "../src/juego/personaje.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";
import { GuionesDeObjeto, GuionDeObjeto, QUIEN_VISTE } from "../src/play/guionobjeto.js";
import { TablaDeEfectos } from "../src/play/efectos.js";
import { defensaDelJugador } from "../src/play/escudo.js";
import { seVisteAlCargar } from "../src/play/armadura.js";
import { Equipo, manoQuePide, contenedorPara } from "../src/play/equipar.js";
import { Ciclador, siguienteEnInventario } from "../src/play/ranuras.js";
import { fabricar, OBJETOS, EN_LA_MANO } from "../tools/personaje.mjs";

const OBJ = "build/msr/objetos.json";
const GUIONES = "build/msr/objetosguion.json";
const JUGADOR = "build/msr/jugador.json";
const EFECTOS = "build/msr/efectosguion.json";
const hay = [OBJ, GUIONES, JUGADOR, EFECTOS].every(existsSync);
const leer = (f) => JSON.parse(readFileSync(f, "utf8"));
const catalogo = hay ? leer(OBJ) : null;
const lista = catalogo ? (Array.isArray(catalogo.objetos) ? catalogo.objetos : Object.values(catalogo.objetos)) : [];
const fichaDe = (id) => lista.find((o) => o.id === id) ?? null;
const guiones = hay ? new GuionesDeObjeto(leer(GUIONES)) : null;
const fichaJugador = hay ? leer(JUGADOR) : null;
const tablaEfectos = hay ? new TablaDeEfectos(leer(EFECTOS)) : null;

const NUEVO = { oro: 10, gratis: ["sheath_belt_holster", "sheath_back", "sheath_dagger", "pack_sack"], armas: ["swords_rsword", "axes_rsmallaxe"] };

// ════════════════════════════════════════════════════════════════════════════
describe("EL ARMA DE PARTIDA: en la mano y SÓLO en la mano (versión 2)", () => {
  test("`crearPersonaje` la pone en `manos.derecha` y no en `objetos` (sv_character.cpp:94-96)", () => {
    const p = crearPersonaje({ nombre: "Ana", arma: "swords_rsword", nuevoPersonaje: NUEVO });
    assert.equal(p.version, 2);
    assert.equal(p.manos.derecha, "swords_rsword");
    assert.deepEqual(p.objetos.map((o) => o.id), NUEVO.gratis);
    // Y «todo lo que lleva» la cuenta UNA vez.
    assert.equal(loQueLleva(p).filter((o) => o.id === "swords_rsword").length, 1);
  });

  test("un personaje de la VERSIÓN 1 con el duplicado de la creación se abre con una sola", () => {
    // Tal como lo escribía el `crearPersonaje` de antes del 97.
    const viejo = { ...crearPersonaje({ nombre: "Beto", arma: "swords_rsword", nuevoPersonaje: NUEVO }), version: 1 };
    viejo.objetos = [...viejo.objetos, { id: "swords_rsword", n: 1 }];
    const { personaje, avisos } = abrirPersonaje(viejo);
    assert.equal(personaje.version, VERSION);
    assert.equal(personaje.manos.derecha, "swords_rsword");
    assert.equal(personaje.objetos.filter((o) => o.id === "swords_rsword").length, 0);
    assert.ok(avisos.some((a) => /en la mano Y en los objetos/.test(a)), avisos.join(" | "));
  });

  test("CONTROL: uno de la versión 1 que YA cambió de arma no pierde nada", () => {
    // `cumplir` sacaba de la lista todas las copias de lo que empuñabas.
    const viejo = { ...crearPersonaje({ nombre: "Cris", arma: "swords_rsword", nuevoPersonaje: NUEVO }), version: 1 };
    viejo.manos = { derecha: "axes_rsmallaxe", izquierda: null };
    viejo.objetos = [...viejo.objetos, { id: "swords_rsword", n: 1 }];
    const { personaje, avisos } = abrirPersonaje(viejo);
    assert.deepEqual(personaje.objetos.map((o) => o.id), [...NUEVO.gratis, "swords_rsword"]);
    assert.ok(!avisos.some((a) => /en la mano Y/.test(a)));
  });

  test("y uno de la versión 2 con DOS espadas de verdad (una en la mano) las conserva", () => {
    const p = crearPersonaje({ nombre: "Dani", arma: "swords_rsword", nuevoPersonaje: NUEVO });
    p.objetos.push({ id: "swords_rsword", n: 1 });
    const { personaje } = abrirPersonaje(structuredClone(p));
    assert.equal(personaje.objetos.filter((o) => o.id === "swords_rsword").length, 1);
  });

  test("EL CICLADOR con dos espadas iguales: desde la mano de la versión 1, la tercera arma era inalcanzable", () => {
    // `siguienteEnInventario` es el `GetItemInInventory` del motor (busca por
    // id). Lo de abajo es la lista que `mundoDelCiclador` (src/main.js) le pasa,
    // con `enMano` por id: la reproducción del 96 (doc/ARMAS_96.md).
    const lista1 = [
      { id: "swords_rsword", arma: true, enMano: false },
      { id: "swords_novablade12", arma: true, enMano: true },
      { id: "swords_rsword", arma: true, enMano: false },
      { id: "axes_rsmallaxe", arma: true, enMano: false },
    ];
    const c = new Ciclador();
    const vistos = [];
    for (let k = 0; k < 4; k++) { c.elegir("weapon", { objetos: lista1 }); vistos.push(c.etiqueta?.id ?? null); }
    assert.ok(!vistos.includes("axes_rsmallaxe"), `con el duplicado: ${vistos.join(" → ")}`);
    // Con la forma de la versión 2 no hay duplicado y se llega.
    const lista2 = lista1.filter((o, i) => i !== 0);
    const c2 = new Ciclador();
    const vistos2 = [];
    for (let k = 0; k < 3; k++) { c2.elegir("weapon", { objetos: lista2 }); vistos2.push(c2.etiqueta?.id ?? null); }
    assert.ok(vistos2.includes("axes_rsmallaxe"), vistos2.join(" → "));
    assert.equal(siguienteEnInventario(lista2, "swords_rsword", { soloArmas: true })?.id, "axes_rsmallaxe");
  });

  test("Veteran (tools/personaje.mjs): la Blood Drinker en la mano y no en la lista; el peso, el de todo", () => {
    const p = fabricar({ nombre: "Veteran", ahora: "2026-10-03T00:00:00.000Z" });
    assert.equal(p.manos.derecha, EN_LA_MANO);
    assert.equal(p.objetos.filter((o) => o.id === EN_LA_MANO).length, 0);
    // Todo lo que nombra `OBJETOS` lo lleva, cada cosa una vez.
    for (const id of OBJETOS) assert.equal(loQueLleva(p).filter((o) => o.id === id).length, 1, id);
    const { avisos } = abrirPersonaje(structuredClone(p));
    assert.deepEqual(avisos, []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
/** Monta un personaje como `sincronizarObjetosVivos` + `moverEquipo` de src/main.js. */
function montar(p) {
  let t = 10;
  const dicho = [];
  const jugador = new GuionDelJugador({
    ficha: fichaJugador, personaje: p, efectos: tablaEfectos,
    suceso: (tipo, texto) => dicho.push({ tipo, texto }),
    consejo: () => {}, dar: () => {}, ahora: () => t, aviso: () => {},
  });
  const vivos = new Map();
  for (const o of loQueLleva(p)) {
    if (!guiones.tiene(o.id) || vivos.has(o.id)) continue;
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
  let activa = "derecha";
  const orden = (hacer) => {
    const eq = new Equipo({
      personaje: p, fichaDe, objetoDe: (id) => vivos.get(id) ?? null,
      decir: (tipo, texto) => dicho.push({ tipo, texto }), activa, genero: p.genero,
    });
    const r = hacer(eq);
    activa = eq.activa;
    return { ...r, diario: eq.diario };
  };
  const pegar = (dano, tipo = "") => defensaDelJugador({
    dano, tipo, parry: 0, dados: { acierto: 1 }, equipo: [...vivos.values()], atacante: "Giant Rat",
  }).dano;
  return { p, jugador, vivos, dicho, avanzar, orden, pegar, get activa() { return activa; } };
}

const veteran = () => montar(fabricar({ nombre: "Veteran", ahora: "2026-10-03T00:00:00.000Z" }));
const dijo = (m, texto) => m.dicho.some((d) => d.texto === texto);

describe("PONERSE Y QUITARSE (src/play/equipar.js) con Veteran y los guiones del juego", { skip: !hay && "faltan los horneados" }, () => {
  test("las manos que piden las fichas: armadura `any`, Blood Drinker `both` (genericitem.cpp:2117-2130)", () => {
    assert.equal(manoQuePide(fichaDe("armor_pheonix55")), "cualquiera");
    assert.equal(manoQuePide(fichaDe("armor_helm_gray")), "cualquiera");   // sin `sethand`: ANY_HAND (:600)
    assert.equal(manoQuePide(fichaDe("swords_blood_drinker")), "ambas");
  });

  test("CONTROL POSITIVO de partida: Veteran llega con el fénix puesto y un golpe de 10 se queda en 4,5", () => {
    const m = veteran();
    assert.equal(m.pegar(10), 4.5);
  });

  test("«Remove» con la Blood Drinker en la mano: «…because your hands are full!» y no se mueve nada", () => {
    const m = veteran();
    const r = m.orden((eq) => eq.aLaMano("armor_pheonix55", "remove"));
    assert.equal(r.hecho, false);
    assert.ok(dijo(m, "You can't get Armor of the Phoenix because your hands are full!"), JSON.stringify(m.dicho.slice(-3)));
    // `remove` no libera manos (`GiveTo` sin `fPutItemsAway`, client.cpp:1003).
    assert.equal(m.p.manos.derecha, "swords_blood_drinker");
    assert.equal(m.pegar(10), 4.5, "la armadura sigue puesta");
  });

  test("la `q` con la Blood Drinker: no se viste, se GUARDA — «You put Blood Drinker in Heavy Weapon Holster»", () => {
    const m = veteran();
    const r = m.orden((eq) => eq.usar("derecha"));
    assert.equal(r.que, "guardado");
    assert.equal(m.p.manos.derecha, null);
    assert.ok(m.p.objetos.some((o) => o.id === "swords_blood_drinker"));
    // `swords` busca una funda (`GetContainer("sheath")`, genericitem.cpp:1165),
    // y el primer contenedor cuyo nombre la contiene es `sheath_belt_holster`.
    //
    // CORRECCIÓN DEL 98: ése es el PEDIDO, y no cabe: el Heavy Weapon Holster
    // sólo acepta `axes;blunt` (sheath_belt_holster.script:10). `FindPackForItem`
    // pasa entonces a la vuelta por todos (genericitem.cpp:1175-1189) y la
    // primera que la admite es la Back Sword Sheath (`swords;polearms`, tope 1).
    // El 97 esperaba «…in Heavy Weapon Holster» porque no miraba la capacidad.
    assert.ok(dijo(m, "You put Blood Drinker in Back Sword Sheath"), JSON.stringify(m.dicho.slice(-3)));
    // `game_putinpack` ANTES de soltarlo (genericitem.cpp:1249-1250).
    assert.deepEqual(r.diario.slice(0, 2), ["swords_blood_drinker:game_putinpack", "swords_blood_drinker:game_removefromowner"]);
  });

  test("QUITÁRSELA: con una mano libre va a la IZQUIERDA, en el orden del motor, y deja de proteger", () => {
    const m = veteran();
    m.orden((eq) => eq.usar("derecha"));                 // la espada, a la funda
    const r = m.orden((eq) => eq.aLaMano("armor_pheonix55", "remove"));
    assert.equal(r.hecho, true);
    // ANY_HAND mira primero la izquierda (playershared.cpp:405-411).
    assert.equal(m.p.manos.izquierda, "armor_pheonix55");
    assert.equal(m.activa, "izquierda", "`SwitchHands` a la mano nueva (msmonstershared.cpp:357-360)");
    assert.ok(!m.p.objetos.some((o) => o.id === "armor_pheonix55"), "en la mano no está en la lista");
    assert.deepEqual(r.diario, [
      "armor_pheonix55:game_removefromowner", "armor_pheonix55:game_newowner", "armor_pheonix55:game_pickup",
      "armor_pheonix55:game_deploy", "armor_pheonix55:game_removepack",
    ]);
    assert.equal(m.vivos.get("armor_pheonix55").puesto, false);
    assert.equal(m.pegar(10), 10, "en la mano no protege");
  });

  test("y su magia se va: la resistencia al fuego vuelve a cero por su `game_deploy`", () => {
    const m = veteran();
    m.avanzar(0.5);
    assert.equal(m.jugador.resistencias.multiplicar(10, "fire"), 2.5, "CONTROL: puesta, el fuego entra al 25 %");
    m.orden((eq) => eq.usar("derecha"));
    m.orden((eq) => eq.aLaMano("armor_pheonix55", "remove"));
    m.avanzar(0.5);
    assert.equal(m.jugador.resistencias.multiplicar(10, "fire"), 10);
  });

  test("PONÉRSELA con la `q`: `game_wear` jugando, a la lista con `puesto`, y vuelve a proteger", () => {
    const m = veteran();
    m.orden((eq) => eq.usar("derecha"));
    m.orden((eq) => eq.aLaMano("armor_pheonix55", "remove"));
    assert.equal(m.pegar(10), 10);
    const r = m.orden((eq) => eq.usar(m.activa));
    assert.equal(r.que, "vestido");
    assert.deepEqual(r.diario, ["armor_pheonix55:game_wear"]);
    assert.equal(m.p.manos.izquierda, null);
    assert.ok(m.p.objetos.some((o) => o.id === "armor_pheonix55" && o.puesto));
    assert.equal(m.pegar(10), 4.5);
    m.avanzar(0.5);
    assert.ok(dijo(m, "Your resistance to fire is now 75%"));
  });

  test("DOBLE CLIC en la mochila (`inv transfer <id> 0`): libera las manos guardando la espada y la saca a la izquierda", () => {
    const m = veteran();
    // CORRECCIÓN DEL 98. Esta prueba guardaba el fénix en el Heavy Weapon
    // Holster y lo sacaba de ahí. En el juego eso NO PASA: ninguno de los cuatro
    // contenedores de Veteran admite una armadura (la funda `axes;blunt`, la de
    // espalda `swords;polearms`, la de daga `smallarms` y el saco RECHAZA
    // `armor`, pack_sack.script:18). Se queda en la mano con una de las dos
    // frases de `PutInPack` (playershared.cpp:676-688).
    m.orden((eq) => eq.usar("derecha"));
    m.orden((eq) => eq.aLaMano("armor_pheonix55", "remove"));
    const g = m.orden((eq) => eq.guardarEn("izquierda", "sheath_belt_holster"));
    assert.equal(g.hecho, false);
    assert.ok(dijo(m, "Your Heavy Weapon Holster can't fit that!")
      || dijo(m, "You try to stuff Armor of the Phoenix into your Heavy Weapon Holster, but to no avail."), JSON.stringify(m.dicho.slice(-2)));
    assert.equal(m.p.manos.izquierda, "armor_pheonix55");
    m.orden((eq) => eq.usar("izquierda"));                 // se lo vuelve a poner
    // Lo mismo que medía, con lo que SÍ está en un contenedor: la Fire Blade,
    // que `colocar` mete en la Dagger Sheath (`smallarms`).
    const daga = m.p.objetos.find((o) => o.id === "smallarms_k_fire");
    assert.equal(daga.en, "sheath_dagger");
    // Y la espada otra vez en la mano, por el ciclador.
    m.p.objetos.splice(m.p.objetos.findIndex((o) => o.id === "swords_blood_drinker"), 1);
    m.p.manos.derecha = "swords_blood_drinker";
    m.dicho.length = 0;
    const r = m.orden((eq) => eq.aLaMano("smallarms_k_fire", "transfer"));
    assert.equal(r.hecho, true);
    // `FreeHands`: `PutAway` de la preferida (la derecha, que es la que pide la
    // daga y la que llena la de dos manos) y luego `iAddHand = 0`
    // (playershared.cpp:449-487).
    assert.equal(m.p.manos.derecha, null);
    assert.equal(m.p.manos.izquierda, "smallarms_k_fire");
    assert.ok(dijo(m, "You put Blood Drinker in Back Sword Sheath"), JSON.stringify(m.dicho));
    assert.deepEqual(r.diario.slice(-2), ["smallarms_k_fire:removefrompack", "smallarms_k_fire:game_removefrompack"]);
  });

  test("EL CHALECO ENCIMA: «You have no more chest slots» DOS veces y a la funda", () => {
    // CORRECCIÓN DEL 98. El doble aviso existe, pero SÓLO cuando algún
    // contenedor admite el chaleco: `CanPutinInventory` es `CanWearItem() ||
    // FindPackForItem()` (genericitem.cpp:1032), y sin contenedor que lo admita
    // devuelve falso y `UseItem` sale (:991-992) ANTES del segundo
    // `CanWearItem`. Con los cuatro de Veteran —ninguno admite `armor`— sale
    // UNA vez y el chaleco se queda en la mano. Con una Heavy Backpack
    // (`reject scroll2;shields;pack`, pack_heavybackpack.script:16), las dos.
    const m = veteran();
    m.p.objetos.push({ id: "armor_leather", n: 1 });
    const m2 = montar(m.p);
    m2.orden((eq) => eq.usar("derecha"));               // libera la mano
    m2.orden((eq) => eq.aLaMano("armor_leather", "transfer"));
    m2.dicho.length = 0;
    const r1 = m2.orden((eq) => eq.usar(m2.activa));
    assert.equal(r1.hecho, false);
    assert.equal(m2.dicho.filter((d) => d.texto === "You have no more chest slots").length, 1, JSON.stringify(m2.dicho));
    assert.ok(Object.values(m2.p.manos).includes("armor_leather"));
    // Y con una mochila que sí lo admite, el doble aviso del 97.
    m2.p.objetos.splice(4, 0, { id: "pack_heavybackpack", n: 1 });
    m2.dicho.length = 0;
    const r = m2.orden((eq) => eq.usar(m2.activa));
    assert.equal(r.que, "guardado");
    // `CanPutinInventory` -> `CanWearItem` (verboso en el servidor siempre,
    // genericitem.cpp:1040-1045) y otra vez `WearItem` -> `CanWearItem`.
    assert.equal(m2.dicho.filter((d) => d.texto === "You have no more chest slots").length, 2, JSON.stringify(m2.dicho));
    assert.ok(dijo(m2, "You put Leather Vest in Heavy Backpack"), JSON.stringify(m2.dicho));
    assert.equal(m2.pegar(10), 4.5, "sigue el fénix");
  });

  test("la `q` con la mano vacía no hace nada (playershared.cpp:793-806)", () => {
    const m = veteran();
    m.orden((eq) => eq.usar("derecha"));
    const r = m.orden((eq) => eq.usar("derecha"));
    assert.equal(r.hecho, false);
  });

  test("el contenedor del mensaje: `arrow` al carcaj, `swords` a la funda, `axes` a la pistolera, si no el primero", () => {
    const cajas = [{ id: "pack_sack" }, { id: "sheath_belt_holster" }, { id: "quiver_x" }];
    assert.equal(contenedorPara("proj_arrow_wooden", cajas).id, "quiver_x");
    assert.equal(contenedorPara("swords_rsword", cajas).id, "sheath_belt_holster");
    assert.equal(contenedorPara("axes_dragon", cajas).id, "sheath_belt_holster");
    assert.equal(contenedorPara("armor_leather", cajas).id, "pack_sack");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CON SERVIDOR: el personaje nace por `CREAR` y se elige por `ELEGIR`, como lo
// hace el cliente; `VESTIR` sólo cambia la marca de lo que la sesión del
// servidor lleva. Ver `Partida._vestir`.
import { MENSAJE } from "../src/red/protocolo.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";

describe("CON SERVIDOR: `MENSAJE.VESTIR` (el 97)", { skip: !hay && "faltan los horneados" }, () => {
  const APARICION = { mapa: "liso", nacimiento: { nombre: "c", escena: [0, 0.2, 0] }, reaparicion: { nombre: "c", escena: [0, 0.2, 0] } };
  async function dentro() {
    const partida = new Partida({ mundo: await mundoLiso(), almacen: new AlmacenMemoria(), aparicion: APARICION, catalogo });
    const dentro = [];
    const b = { enviar: (t) => dentro.push(JSON.parse(t)), al: () => () => {} };
    const c = partida.conectar(b, { nombre: "Uno" });
    const arma = catalogo?.nuevoPersonaje?.armas?.[0];
    await partida.recibir(c.id, { t: MENSAJE.CREAR, personaje: { nombre: "Uno", ...(arma ? { arma } : {}) } });
    const lista = [...dentro].reverse().find((m) => m.t === MENSAJE.LISTA);
    await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: lista.personajes[0].id });
    return { partida, c, fallo: () => [...dentro].reverse().find((m) => m.t === MENSAJE.FALLO) ?? null, arma };
  }

  test("el personaje que crea el servidor tiene el arma SÓLO en la mano", async () => {
    const { c, arma } = await dentro();
    assert.ok(arma, "el catálogo trae las armas de partida");
    assert.equal(c.sesion.personaje.manos.derecha, arma);
    assert.ok(!c.sesion.personaje.objetos.some((o) => o.id === arma));
  });

  test("ponerse y quitarse cambian la marca; lo que no lleva o no se viste da FALLO y no toca nada", async () => {
    const { partida, c, fallo } = await dentro();
    const p = c.sesion.personaje;
    p.objetos.push({ id: "armor_pheonix55", n: 1 });
    await partida.recibir(c.id, { t: MENSAJE.VESTIR, id: "armor_pheonix55", puesto: true });
    assert.equal(p.objetos.find((o) => o.id === "armor_pheonix55").puesto, true);
    await partida.recibir(c.id, { t: MENSAJE.VESTIR, id: "armor_pheonix55", puesto: false });
    assert.equal(p.objetos.find((o) => o.id === "armor_pheonix55").puesto, undefined);
    await partida.recibir(c.id, { t: MENSAJE.VESTIR, id: "armor_leather", puesto: true });
    assert.match(fallo()?.porque ?? "", /not carrying armor_leather/);
    p.objetos.push({ id: "health_apple", n: 1 });
    await partida.recibir(c.id, { t: MENSAJE.VESTIR, id: "health_apple", puesto: true });
    assert.match(fallo()?.porque ?? "", /is not wearable/);
    assert.equal(p.objetos.find((o) => o.id === "health_apple").puesto, undefined);
  });
});
