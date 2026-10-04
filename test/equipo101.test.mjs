// EL 101: LO QUE SE VE DE LO QUE LLEVAS — el muñeco del HUD y la pantalla de
// elección de personaje.
//
// Por dónde entra cada prueba (el 59 y el 67):
//
//   - El personaje es `crearPersonaje`, y la pieza se pone con `vestir` de
//     src/play/armadura.js, que es por donde se la pone el juego.
//   - El modelo y el `body` NO están escritos aquí como entrada: salen del guion
//     horneado de cada objeto (`build/msr/objetosguion.json`). Lo que SÍ está
//     escrito a mano son los números esperados, con su cita al lado (el 75:
//     cuando el número es la regla, va escrito y no leído de una constante).
//   - Los guiones de mentira —la pieza que sólo cubre las piernas, que en el
//     juego no existe— son TEXTO que parte el analizador, no comandos a mano.
//
// Ver src/play/equipovisto.js.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { crearPersonaje, aLaVistaDe } from "../src/juego/personaje.js";
import { GuionesDeObjeto, GuionDeObjeto } from "../src/play/guionobjeto.js";
import { partirGuion } from "../src/play/guion.js";
import { vestir, fichasPuestas } from "../src/play/armadura.js";
import {
  cuerpoDe, aspectoDe, equipoDelMuneco, equipoEnLaEleccion, piezasConCuerpo,
  firmaDe, claveDeModelo, MANO, aLaVistaSinGuion,
} from "../src/play/equipovisto.js";

const OBJETOS = "build/msr/objetos.json";
const GUIONES = "build/msr/objetosguion.json";
const EQUIPO = "build/msr/equipo.json";
const hay = [OBJETOS, GUIONES].every(existsSync);
const hayEquipo = hay && existsSync(EQUIPO);
const leer = (f) => JSON.parse(readFileSync(f, "utf8"));

const catalogo = hay ? leer(OBJETOS) : null;
const lista = catalogo ? (Array.isArray(catalogo.objetos) ? catalogo.objetos : Object.values(catalogo.objetos)) : [];
const fichaDe = (id) => lista.find((o) => o.id === id) ?? null;
const guiones = hay ? new GuionesDeObjeto(leer(GUIONES)) : null;
const manifiesto = hayEquipo ? leer(EQUIPO) : null;

const VESTE = "armor/p_armorvest_new.mdl";      // items/armor_base.script:22
const YELMOS = "armor/p_helmets.mdl";

/** Un personaje que lleva `llevar` en la mochila y se pone `ponerse`, como en el juego. */
function personajeCon({ genero = "male", llevar = [], ponerse = [], manos = {} } = {}) {
  const p = crearPersonaje({ nombre: "Ana", genero });
  p.manos = { derecha: null, izquierda: null, ...manos };
  for (const id of llevar) p.objetos.push({ id, n: 1 });
  for (const id of ponerse) {
    const entrada = p.objetos.find((o) => o.id === id);
    const r = vestir({ entrada, ficha: fichaDe(id), objeto: null, puestas: fichasPuestas(p.objetos, fichaDe), genero });
    assert.equal(r.puesto, true, `no se pudo poner ${id}: ${r.mensaje ?? r.porque}`);
  }
  return p;
}
const delMuneco = (p) => equipoDelMuneco({ personaje: p, guiones, fichaDe });
const veste = (piezas) => piezas.filter((x) => x.modelo === VESTE);

describe("`SetBody`: cómo se pliega un `setmodelbody` (clrenderent.cpp:102-117)", () => {
  // Un modelo de equipo es UNA parte con muchos submodelos y base 1.
  const una = [{ n: 40, base: 1 }];
  test("el valor sustituye al que hubiera en ese grupo, no se suma", () => {
    assert.equal(cuerpoDe(una, [[0, 6]]), 6);
    assert.equal(cuerpoDe(una, [[0, 6], [0, 26]]), 26);
  });
  test("un valor que el grupo NO tiene se ignora: `if (Value < pbodypart->nummodels)`", () => {
    // 6 y luego 46 en un grupo de 40: se queda en 6, no en 46 ni en 46 % 40.
    assert.equal(cuerpoDe(una, [[0, 6], [0, 46]]), 6);
    assert.equal(cuerpoDe(una, [[0, 40]]), 0);
  });
  test("con varias partes cada una pesa su base, como el cuerpo del jugador (1, 3, 9, 27)", () => {
    const cuatro = [{ n: 3, base: 1 }, { n: 3, base: 3 }, { n: 3, base: 9 }, { n: 3, base: 27 }];
    assert.equal(cuerpoDe(cuatro, [[0, 1], [1, 1], [2, 1], [3, 1]]), 40);
    assert.equal(cuerpoDe(cuatro, [[0, 2], [1, 2], [2, 2], [3, 2]]), 80);
    // Y cambiar una sola no toca las otras tres.
    assert.equal(cuerpoDe(cuatro, [[0, 1], [1, 1], [2, 1], [3, 1], [2, 0]]), 31);
  });
  test("un grupo que el modelo no tiene no hace nada", () => {
    assert.equal(cuerpoDe(una, [[0, 5], [3, 2]]), 5);
  });
});

describe("el guion de un objeto dice su modelo (genericitem.cpp:2199-2225)", () => {
  const tabla = (texto) => new GuionesDeObjeto({
    objetos: { cosa: { ruta: "items/cosa" } }, archivos: { "items/cosa": partirGuion(texto) },
  });
  const correr = (texto, eventos = ["game_spawn"]) => {
    const e = new GuionDeObjeto({ guiones: tabla(texto), id: "cosa" });
    for (const ev of eventos) e.llamar(ev);
    return e;
  };
  test("`setmodel` y `setmodelbody` se quedan en la entidad, en orden", () => {
    const e = correr("{ game_spawn\n\tsetmodel armor/x.mdl\n\tsetmodelbody 0 3\n\tsetmodelbody 0 7\n}\n");
    assert.equal(e.modelo, "armor/x.mdl");
    assert.deepEqual(e.cuerpos, [[0, 3], [0, 7]]);
    assert.deepEqual(e.noSoportados.filter((n) => /setmodel/.test(n.nombre)), []);
  });
  test("sin modelo, `setmodelbody` no hace nada: `if (m_ClEntNormal.model)`", () => {
    const e = correr("{ game_spawn\n\tsetmodelbody 0 3\n}\n");
    assert.equal(e.modelo, null);
    assert.deepEqual(e.cuerpos, []);
  });
  test("`setmodel none` lo quita", () => {
    const e = correr("{ game_spawn\n\tsetmodel armor/x.mdl\n\tsetmodelbody 0 3\n\tsetmodel none\n}\n");
    assert.equal(e.modelo, null);
  });
  test("`$get(ent_owner,gender)`: el género del dueño, y «0» si NO hay dueño (script.cpp:1195-1198)", () => {
    const texto = "{ game_spawn\n\tsetvard G $get(ent_owner,gender)\n\tsetvard R $get(ent_owner,race)\n}\n";
    const g = tabla(texto);
    const con = (jugador) => { const e = new GuionDeObjeto({ guiones: g, id: "cosa", jugador }); e.llamar("game_spawn"); return [e.guion.vars.get("G"), e.guion.vars.get("R")]; };
    assert.deepEqual(con({ personaje: { genero: "female" }, llamar: () => false }), ["female", "human"]);
    assert.deepEqual(con({ personaje: { genero: "male" }, llamar: () => false }), ["male", "human"]);
    // Sin dueño es «0», no vacío: de eso cuelga `if ( OWNER_GENDER equals 0 )`.
    assert.deepEqual(con(null), ["0", "0"]);
  });

  test("`game.item.hand_index` es la mano de la entidad, y la IZQUIERDA es el 0 (genericitem.h:15-18)", () => {
    const texto = "{ game_spawn\n\tsetmodel armor/x.mdl\n\tlocal L 10\n\tsubtract L game.item.hand_index\n\tsetmodelbody 0 L\n}\n";
    const g = tabla(texto);
    const con = (mano) => { const e = new GuionDeObjeto({ guiones: g, id: "cosa" }); e.mano = mano; e.llamar("game_spawn"); return e.cuerpos; };
    assert.deepEqual(con(MANO.izquierda), [[0, 10]]);
    assert.deepEqual(con(MANO.derecha), [[0, 9]]);
    assert.equal(MANO.izquierda, 0);
    assert.equal(MANO.derecha, 1);
  });
});

describe("el muñeco lleva lo que llevas (101)", { skip: !hay && "faltan los horneados" }, () => {
  test("SIN armadura no hay ninguna veste: el control positivo del valor de reposo", () => {
    assert.deepEqual(veste(delMuneco(personajeCon())), []);
  });

  test("la coraza EN LA MOCHILA tampoco se ve: lo que va en una bolsa no está en el `Gear`", () => {
    assert.deepEqual(veste(delMuneco(personajeCon({ llevar: ["armor_plate"] }))), []);
  });

  test("PUESTA, la coraza de placas es el submodelo 1 de `p_armorvest_new` (armor_plate.script:10)", () => {
    const v = veste(delMuneco(personajeCon({ llevar: ["armor_plate"], ponerse: ["armor_plate"] })));
    assert.equal(v.length, 1);
    assert.equal(v[0].id, "armor_plate");
    assert.equal(v[0].donde, "cuerpo");
    assert.equal(cuerpoDe([{ n: 40, base: 1 }], v[0].cuerpos), 1);
  });

  test("EL SEGUNDO CASO: el fénix es OTRO submodelo, el 11 (armor_pheonix55.script, `NEW_ARMOR_OFS`)", () => {
    const v = veste(delMuneco(personajeCon({ llevar: ["armor_pheonix55"], ponerse: ["armor_pheonix55"] })));
    assert.equal(v.length, 1);
    assert.equal(cuerpoDe([{ n: 40, base: 1 }], v[0].cuerpos), 11);
  });

  test("una MUJER lleva la de mujer: `NEW_ARMOR_OFS + 20` (armor_base.script:19, :134-152)", () => {
    const v = veste(delMuneco(personajeCon({ genero: "female", llevar: ["armor_plate"], ponerse: ["armor_plate"] })));
    assert.equal(cuerpoDe([{ n: 40, base: 1 }], v[0].cuerpos), 21);
  });

  test("el yelmo va en `p_helmets`, y el de mujer catorce más allá (armor_base_helmet.script:65-67)", () => {
    const de = (genero) => delMuneco(personajeCon({ genero, llevar: ["armor_helm_gray"], ponerse: ["armor_helm_gray"] }))
      .filter((x) => x.modelo === YELMOS);
    const h = de("male"), m = de("female");
    assert.equal(h.length, 1);
    assert.equal(cuerpoDe([{ n: 32, base: 1 }], h[0].cuerpos), 5);
    assert.equal(cuerpoDe([{ n: 32, base: 1 }], m[0].cuerpos), 19);
  });

  test("coraza y yelmo a la vez son DOS piezas, una por objeto del `Gear` (clrenderent.cpp:310-312)", () => {
    const p = delMuneco(personajeCon({ llevar: ["armor_plate", "armor_helm_gray"], ponerse: ["armor_plate", "armor_helm_gray"] }));
    assert.deepEqual(p.filter((x) => x.modelo === VESTE || x.modelo === YELMOS).map((x) => x.id), ["armor_plate", "armor_helm_gray"]);
  });

  test("al QUITÁRSELA deja de verse, y la firma cambia", () => {
    const p = personajeCon({ llevar: ["armor_plate"], ponerse: ["armor_plate"] });
    const con = firmaDe(delMuneco(p));
    delete p.objetos.find((o) => o.id === "armor_plate").puesto;
    const sin = firmaDe(delMuneco(p));
    assert.notEqual(con, sin);
    assert.deepEqual(veste(delMuneco(p)), []);
  });

  test("EN LA MANO: la espada oxidada es el 24 en la derecha y el 25 en la izquierda (base_weapon.script:43-47)", () => {
    // `L_SUBMODEL = MODEL_BODY_OFS + 1 - game.item.hand_index`, con OFS 24.
    const en = (mano) => delMuneco(personajeCon({ manos: { [mano]: "swords_rsword" } })).filter((x) => x.id === "swords_rsword");
    const d = en("derecha"), i = en("izquierda");
    assert.equal(d.length, 1);
    assert.equal(d[0].modelo, "weapons/p_weapons1.mdl");
    assert.equal(d[0].donde, "mano");
    assert.deepEqual(d[0].cuerpos.at(-1), [0, 24]);
    assert.deepEqual(i[0].cuerpos.at(-1), [0, 25]);
  });

  test("una coraza EN LA MANO es el paquete (`p_misc`), no la veste (armor_base.script:70-78)", () => {
    const p = delMuneco(personajeCon({ manos: { izquierda: "armor_plate" } }));
    assert.deepEqual(veste(p), []);
    assert.equal(p.find((x) => x.id === "armor_plate")?.modelo, "misc/p_misc.mdl");
    // 16 es `package_lhand` en el `.mdl`.
    assert.deepEqual(p.find((x) => x.id === "armor_plate").cuerpos.at(-1), [0, 16]);
  });

  test("FALLO DEL ORIGINAL: en la DERECHA el paquete sale con el submodelo del SUELO (armor_base.script:75-77)", () => {
    // `local L_SUBMODEL 16` y `add L_SUBMODEL game.item.hand_index`: SUMA la
    // mano donde las armas la RESTAN (base_weapon.script:43-45). 16 + 1 = 17,
    // que en `misc/p_misc.mdl` se llama `package_floor`; el de la mano derecha
    // es el 15, `package_rhand`, y no sale nunca.
    const p = delMuneco(personajeCon({ manos: { derecha: "armor_plate" } }));
    assert.deepEqual(p.find((x) => x.id === "armor_plate").cuerpos.at(-1), [0, 17]);
  });

  test("lo que SÓLO cubre las piernas no sale en el muñeco, y sí en la elección (clrenderent.cpp:460-465)", () => {
    // En el juego no hay ninguna pieza así: es un guion de mentira, en texto.
    const texto = (zonas) => `{ game_spawn\n\tsetvard ARMOR_REPLACE_BODYPARTS ${zonas}\n\tregisterarmor\n}\n` +
      "{ game_wear\n\tsetmodel armor/p_armorvest_new.mdl\n\tsetmodelbody 0 3\n}\n";
    const g = new GuionesDeObjeto({
      objetos: { grebas: { ruta: "items/grebas" }, peto: { ruta: "items/peto" } },
      archivos: { "items/grebas": partirGuion(texto("legs")), "items/peto": partirGuion(texto("chest;legs")) },
    });
    const p = crearPersonaje({ nombre: "Ana" });
    p.manos = { derecha: null, izquierda: null };
    p.objetos = [{ id: "grebas", n: 1, puesto: true }, { id: "peto", n: 1, puesto: true }];
    assert.deepEqual(equipoDelMuneco({ personaje: p, guiones: g }).map((x) => x.id), ["peto"]);
    assert.deepEqual(equipoEnLaEleccion({ personaje: p, guiones: g }).map((x) => x.id), ["grebas", "peto"]);
  });
});

describe("lo que no se puede dibujar se dice (101)", { skip: !hay && "faltan los horneados" }, () => {
  const sin = (p) => aLaVistaSinGuion({ personaje: p, guiones, fichaDe });
  // Un arma del catálogo SIN guion horneado, buscada y no escrita: el día que
  // se horneen todas, esta prueba se queda sin caso y lo dice.
  const sinGuion = lista.find((o) => o.tipo === "arma" && o.mano !== "undroppable" && !guiones?.tiene(o.id))?.id ?? null;

  test("un arma sin guion horneado en la mano: no sale en el muñeco, y sale en la lista de lo que falta", { skip: !sinGuion && "todas las armas tienen guion" }, () => {
    const p = personajeCon({ manos: { derecha: sinGuion } });
    assert.equal(delMuneco(p).some((x) => x.id === sinGuion), false);
    assert.deepEqual(sin(p), [sinGuion]);
  });
  test("EL OTRO CASO: la espada oxidada sí tiene guion y no falta nada", () => {
    assert.deepEqual(sin(personajeCon({ manos: { derecha: "swords_rsword" } })), []);
  });
  test("los puños no cuentan: son `HAND_PLAYERHANDS` y no tienen modelo", () => {
    assert.deepEqual(sin(personajeCon({ manos: { derecha: "fist_bare" } })), []);
  });
  test("lo que va DENTRO de una bolsa tampoco: no está a la vista", () => {
    assert.deepEqual(sin(personajeCon({ llevar: sinGuion ? [sinGuion] : [] })), []);
  });
});

describe("la pantalla de elección (101)", { skip: !hay && "faltan los horneados" }, () => {
  const enEleccion = (p) => equipoEnLaEleccion({ personaje: aLaVistaDe(p), guiones, fichaDe });

  test("entra por la LISTA: `aLaVistaDe` trae género, manos e ids, y nada de estadísticas", () => {
    const v = aLaVistaDe(personajeCon({ genero: "female", llevar: ["armor_plate"], ponerse: ["armor_plate"] }));
    assert.deepEqual(Object.keys(v).sort(), ["genero", "manos", "objetos"]);
    assert.equal(v.genero, "female");
    assert.deepEqual(v.objetos.find((o) => o.id === "armor_plate"), { id: "armor_plate", puesto: true });
  });

  test("un personaje guardado con la coraza puesta la enseña; uno sin ella, no", () => {
    assert.equal(veste(enEleccion(personajeCon({ llevar: ["armor_plate"], ponerse: ["armor_plate"] }))).length, 1);
    assert.equal(veste(enEleccion(personajeCon({ llevar: ["armor_plate"] }))).length, 0);
    assert.equal(veste(enEleccion(personajeCon())).length, 0);
  });

  test("FALLO DEL ORIGINAL: aquí una mujer lleva la coraza de HOMBRE (playershared.cpp:1540-1544)", () => {
    // `game_wear <género> char_menu` sin dueño: `$get(ent_owner,gender)` da «0»
    // (script.cpp:1198) y el guion cae a PARAM2 = «char_menu»
    // (armor_base.script:129-130), que no es «female».
    const mujer = personajeCon({ genero: "female", llevar: ["armor_plate"], ponerse: ["armor_plate"] });
    assert.equal(cuerpoDe([{ n: 40, base: 1 }], veste(enEleccion(mujer))[0].cuerpos), 1);
    // …y jugando, la MISMA mujer con la MISMA coraza lleva la suya: la 21.
    assert.equal(cuerpoDe([{ n: 40, base: 1 }], veste(delMuneco(mujer))[0].cuerpos), 21);
  });

  test("ahí a TODO se le manda `game_wear`: el escudo empuñado sale colgado (el 64), no en la mano (el 61/62)", () => {
    const p = personajeCon({ manos: { izquierda: "shields_buckler" } });
    assert.deepEqual(enEleccion(p).find((x) => x.id === "shields_buckler").cuerpos.at(-1), [0, 64]);
    assert.deepEqual(delMuneco(p).find((x) => x.id === "shields_buckler").cuerpos.at(-1), [0, 62]);
  });

  test("y lo empuñado conserva SU mano (`pItem->m_Hand = Hand`, global.cpp:299): la espada, el 24 en la derecha", () => {
    const en = (mano) => enEleccion(personajeCon({ manos: { [mano]: "swords_rsword" } })).find((x) => x.id === "swords_rsword").cuerpos.at(-1);
    assert.deepEqual(en("derecha"), [0, 24]);
    assert.deepEqual(en("izquierda"), [0, 25]);
  });
});

describe("lo horneado alcanza para lo que la regla pide (101)", { skip: !hayEquipo && "falta build/msr/equipo.json: `npm run equipo`" }, () => {
  test("las partes del manifiesto son las que las pruebas de arriba escriben a mano", () => {
    assert.deepEqual(manifiesto.modelos[claveDeModelo(VESTE)].partes, [{ n: 40, base: 1 }]);
    assert.deepEqual(manifiesto.modelos[claveDeModelo(YELMOS)].partes, [{ n: 32, base: 1 }]);
  });

  test("placas y fénix dan DOS carpetas distintas, que existen y tienen triángulos", () => {
    const de = (id) => piezasConCuerpo(veste(delMuneco(personajeCon({ llevar: [id], ponerse: [id] }))), manifiesto)[0];
    const a = de("armor_plate"), b = de("armor_pheonix55");
    assert.equal(a.cuerpo, 1);
    assert.equal(b.cuerpo, 11);
    assert.notEqual(a.carpeta, b.carpeta);
    for (const x of [a, b]) {
      const ficha = leer(`build/msr/${x.carpeta}/bicho.json`);
      assert.ok(ficha.triangulos > 100, `${x.carpeta}: ${ficha.triangulos} triángulos`);
      // Lo que hace posible colgarla: sus huesos se llaman como los del cuerpo.
      const cuerpo = leer("build/msr/cuerpos.json");
      const huesosDelCuerpo = new Set(leer(`build/msr/${cuerpo.generos.male.carpeta}/bicho.json`).huesos.map((h) => h.nombre));
      const casan = ficha.huesos.filter((h) => huesosDelCuerpo.has(h.nombre)).length;
      assert.ok(casan >= ficha.huesos.length * 0.9, `${x.carpeta}: sólo ${casan} de ${ficha.huesos.length} huesos casan con el cuerpo`);
    }
  });

  test("TODA armadura y todo yelmo horneados tienen su modelo, con los dos géneros y en los dos sitios", () => {
    const piezasDeVestir = guiones.ids.filter((id) => /^armor_/.test(id));
    assert.ok(piezasDeVestir.length >= 25, `sólo ${piezasDeVestir.length} armaduras con guion`);
    const sin = [];
    for (const id of piezasDeVestir) for (const genero of ["male", "female"]) for (const estado of ["puesto", "carga"]) {
      const a = aspectoDe({ guiones, id, estado, genero });
      if (!a?.modelo) { sin.push(`${id} (${genero}, ${estado}): sin modelo`); continue; }
      const [p] = piezasConCuerpo([a], manifiesto);
      if (!p.carpeta) sin.push(`${id} (${genero}, ${estado}): ${p.porque}`);
    }
    assert.deepEqual(sin, []);
  });

  test("un modelo que no está horneado NO se calla: sale sin carpeta y con su porqué", () => {
    const [p] = piezasConCuerpo([{ id: "x", modelo: "armor/no_existe.mdl", cuerpos: [] }], manifiesto);
    assert.equal(p.carpeta, null);
    assert.match(p.porque, /no está horneado/);
  });
});

// ── EL 101b: EL CUERPO QUE SE VE DEBAJO ─────────────────────────────────────
//
// Lo que el jugador vio y la primera versión del 101 no: en la pantalla de
// elección el pantalón asomaba por debajo de la coraza. Las 34 pruebas de
// arriba estaban verdes con eso, porque ninguna preguntaba por el CUERPO.
{
  const { cuerpoGuardado, piezaDelCuerpo } = await import("../src/play/equipovisto.js");
  const JUGADOR = "build/msr/jugador.json";
  const hayJugador = hay && existsSync(JUGADOR);
  const fichaDelJugador = hayJugador ? leer(JUGADOR) : null;
  // `human/reference.mdl`: legs, head, torso, arms, tres submodelos cada una
  // (`blank`, hombre, mujer) y bases 1, 3, 9, 27. Ver tools/cuerpo.mjs.
  const PARTES = [{ n: 3, base: 1 }, { n: 3, base: 3 }, { n: 3, base: 9 }, { n: 3, base: 27 }];
  const bodyDe = (genero, puestos) => cuerpoDe(PARTES, cuerpoGuardado({
    personaje: aLaVistaDe(personajeCon({ genero, llevar: puestos, ponerse: puestos })), guiones, fichaDelJugador,
  }));

  describe("el cuerpo debajo de la armadura (101b)", { skip: !hayJugador && "falta build/msr/jugador.json" }, () => {
    test("SIN armadura el cuerpo va entero: 40 el hombre y 80 la mujer (el valor de reposo)", () => {
      assert.equal(bodyDe("male", []), 40);
      assert.equal(bodyDe("female", []), 80);
    });
    test("con PLACAS sólo queda la cabeza: piernas, torso y brazos en `blank` (externals.script:1311-1317)", () => {
      assert.equal(bodyDe("male", ["armor_plate"]), 3);       // 0·1 + 1·3 + 0·9 + 0·27
      assert.equal(bodyDe("female", ["armor_plate"]), 6);     // 0·1 + 2·3
    });
    test("EL SEGUNDO CASO: con CUERO sólo se va el torso, y las piernas siguen (externals.script:1304-1310)", () => {
      assert.equal(bodyDe("male", ["armor_leather"]), 31);    // 40 − 1·9
      assert.equal(bodyDe("female", ["armor_leather"]), 62);  // 80 − 2·9
    });
    test("el fénix es `platemail` aunque su modelo sea otro: también 3", () => {
      assert.equal(bodyDe("male", ["armor_pheonix55"]), 3);
    });
    test("un YELMO solo no esconde nada: ninguno pone `HELM_HIDES_HEAD`", () => {
      assert.equal(bodyDe("male", ["armor_helm_gray"]), 40);
    });
    test("la coraza EN LA MOCHILA no esconde nada", () => {
      const p = personajeCon({ llevar: ["armor_plate"] });
      assert.equal(cuerpoDe(PARTES, cuerpoGuardado({ personaje: aLaVistaDe(p), guiones, fichaDelJugador })), 40);
    });
    test("el cuerpo entero NO es una pieza; el recortado sí, y es el mismo `.mdl`", { skip: !hayEquipo && "falta equipo.json" }, () => {
      const pieza = (puestos) => piezaDelCuerpo({
        cuerpos: cuerpoGuardado({ personaje: aLaVistaDe(personajeCon({ llevar: puestos, ponerse: puestos })), guiones, fichaDelJugador }),
        genero: "male", manifiesto,
      });
      assert.equal(pieza([]), null);
      const [p] = piezasConCuerpo([pieza(["armor_plate"])], manifiesto);
      assert.equal(p.esCuerpo, true);
      assert.equal(p.clave, "human/reference");
      assert.equal(p.cuerpo, 3);
      assert.ok(p.carpeta, p.porque);
      // Y lo horneado es de verdad sólo la cabeza: muchos menos triángulos que el entero.
      const tri = leer(`build/msr/${p.carpeta}/bicho.json`).triangulos;
      const entero = leer(`build/msr/${leer("build/msr/cuerpos.json").generos.male.carpeta}/bicho.json`).triangulos;
      assert.ok(tri > 100 && tri < entero / 3, `${tri} de ${entero}`);
    });
    test("las partes escritas arriba son las del manifiesto", { skip: !hayEquipo && "falta equipo.json" }, () => {
      assert.deepEqual(manifiesto.modelos["human/reference"].partes, PARTES);
    });
  });
}
