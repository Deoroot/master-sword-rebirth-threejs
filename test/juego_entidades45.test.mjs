// EL 45: `$get_by_name`, `deleteent` y `$get_token_amt`, que son los tres que
// le faltaban al alcalde de Gate City.
//
// Lo que se comprueba es lo que no se deduce leyendo el guion:
//
//   - que `$get_by_name` devuelve un ASA con el puntero dentro, y que esa asa
//     CADUCA cuando la entidad se borra — de eso depende que el bucle del
//     alcalde no borre la entidad equivocada;
//   - que sin `remove` detrás, `deleteent` NO quita una entidad del mapa;
//   - que el troceador de listas del motor no es un `split(";")`;
//   - y que `$get_token_amt` de una cadena sin poner vale 1, que es lo que
//     hace terminar el bucle.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { Guion, partirGuion, partirTokens, GLOBALES, olvidarGlobales } from "../src/play/guion.js";
import { Entidades, aTexto, deTexto, PREFIJO } from "../src/play/entidades.js";
import { entornoDe } from "../src/play/npcguion.js";
import { Aparecedor } from "../src/play/aparecer.js";

// ══ EL TROCEADOR ═══════════════════════════════════════════════════════════

describe("`TokenizeString`, que NO es un `split(\";\")`", () => {
  test("lo normal sale igual que con `split`", () => {
    assert.deepEqual(partirTokens("spawners6;spawners7;spawners8"),
      ["spawners6", "spawners7", "spawners8"]);
  });

  test("un HUECO corta la lista en seco, no da una cadena vacía", () => {
    // `sscanf(&pszString[i], "%[^;]", cTemp)` sobre un punto y coma no casa
    // nada, devuelve 0 y el `while` termina — stackstring.cpp:151.
    // `split` diría ["a", "", "b"]; el motor dice ["a"].
    assert.deepEqual(partirTokens("a;;b"), ["a"]);
  });

  test("y uno al principio deja la lista VACÍA", () => {
    assert.deepEqual(partirTokens(";a"), []);
    assert.deepEqual(partirTokens(""), []);
  });

  test("uno al final no añade nada", () => {
    assert.deepEqual(partirTokens("a;b;"), ["a", "b"]);
  });

  test("una cadena sin puntos y comas es UN token, no cero", () => {
    // Es de lo que depende que `$get_token_amt` de una variable sin poner
    // valga 1: la variable resuelve a su propio nombre, que es un token.
    assert.deepEqual(partirTokens("SPAWN_LIST"), ["SPAWN_LIST"]);
  });
});

// ══ EL ASA ═════════════════════════════════════════════════════════════════

describe("el asa `PentP(idx,dir)`, y por qué lleva la dirección dentro", () => {
  test("el formato es el del motor", () => {
    // `ENT_FORMAT ENT_PREFIX "(%i,%u)"` — sharedutil.cpp:80.
    assert.equal(PREFIJO, "PentP");
    assert.equal(aTexto(3, 17), "PentP(3,17)");
    assert.deepEqual(deTexto("PentP(3,17)"), { indice: 3, direccion: 17 });
  });

  test("lo que no es un asa no se parte, y no lanza", () => {
    // `RetrieveEntity` con un nombre suelto devuelve NULL, y los guiones pasan
    // nombres sueltos por descuido a menudo.
    assert.equal(deTexto("spawners6"), null);
    assert.equal(deTexto(null), null);
    assert.equal(new Entidades().recuperar("spawners6"), null);
  });

  test("un asa vieja NO devuelve la entidad nueva que ocupa su hueco", () => {
    // Éste es todo el motivo de que el puntero vaya dentro:
    //   if (!pEntity || (uint)pEntity != Addr) return NULL;
    //                                       sharedutil.cpp:101
    // Sin la dirección, el `L_KILL_SPAWN` que el alcalde guarda de una vuelta
    // del bucle borraría en la siguiente lo que hubiera caído en ese índice.
    const e = new Entidades();
    e.registrar("spawners6");
    const asa = e.porNombre("spawners6");
    e.borrar(asa);
    e.registrar("otra_cosa");                 // reutiliza el hueco 0
    assert.equal(deTexto(asa).indice, 0);
    assert.equal(deTexto(e.porNombre("otra_cosa")).indice, 0, "sí, es el mismo hueco");
    assert.equal(e.recuperar(asa), null, "y el asa vieja ya no vale");
  });
});

describe("buscar por nombre: `netname` primero, `targetname` después", () => {
  test("un `name_unique` gana a un `targetname` que se llame igual", () => {
    // `UTIL_FindEntityByString(NULL, "netname", "¯" + nombre)` va primero, y
    // sólo si falla se mira el `targetname` — script.cpp:1441-1452.
    const e = new Entidades();
    const mapa = e.registrar("dwarf_mayor");                    // targetname
    const npc = e.registrar("dwarf_mayor", null, { unico: true }); // name_unique
    assert.equal(e.recuperar(e.porNombre("dwarf_mayor")), npc);
    assert.notEqual(npc, mapa);
  });

  test("y las entidades DEL MAPA se encuentran: es la mitad de 2014", () => {
    // «Thothie DEC2014_11 check map ents too». Sin esa segunda búsqueda, el
    // `remove_spawns` del alcalde no encuentra un solo generador, porque
    // «spawners6» es un `targetname` del `.bsp` y no lo puso ningún script.
    const e = new Entidades();
    e.registrar("spawners6");
    assert.ok(e.porNombre("spawners6"));
  });

  test("un nombre que no está devuelve `null`, y el getter lo pasa a «0»", () => {
    assert.equal(new Entidades().porNombre("no_existe"), null);
  });
});

// ══ LOS TRES, EJECUTADOS DESDE UN GUION ════════════════════════════════════

/**
 * Monta el `remove_spawns_loop` del alcalde de verdad, con un mundo detrás.
 * Devuelve con qué se quedó, para poder mirarlo desde fuera.
 */
function mundo({ areas = ["spawners6", "spawners7", "spawners8"] } = {}) {
  const entidades = new Entidades();
  for (const a of areas) entidades.registrar(a);
  const borrados = [];
  const noSoportados = [];
  const entorno = entornoDe({
    entidades,
    borrarDelMundo: (nombre) => borrados.push(nombre),
    apuntar: (tipo, nombre) => noSoportados.push({ tipo, nombre }),
  });
  return { entidades, borrados, noSoportados, entorno };
}

function corre(cuerpo, m = mundo()) {
  const g = new Guion({ eventos: partirGuion(`{ e\n${cuerpo}\n}`).eventos, entorno: m.entorno });
  g.llamar("e", []);
  return { ...m, guion: g };
}

describe("`$get_token_amt`", () => {
  test("cuenta los de la lista", () => {
    const m = corre("setvard L 'a;b;c'\nlocal N $get_token_amt(L)");
    assert.equal(m.guion.vars.get("L"), "a;b;c");
    // Se lee desde dentro: el `local` se borra al terminar el evento.
    const g = corre("setvard L 'a;b;c'\nsetvard N $get_token_amt(L)");
    assert.equal(g.guion.vars.get("N"), "3");
  });

  test("de una variable SIN PONER vale 1, no 0", () => {
    // Lo dice su propio comentario (script.cpp:2657): la variable resuelve a
    // su propio nombre y el nombre es un token. De eso depende que
    // `remove_spawns_loop` dé una vuelta y pare en vez de no dar ninguna.
    const g = corre("setvard N $get_token_amt(NO_EXISTE)");
    assert.equal(g.guion.vars.get("N"), "1");
  });

  test("y NO resuelve el parámetro una segunda vez, al revés que `$get_token`", () => {
    // `$get_token` hace `GetVar(Params[0])` (:2643) y `$get_token_amt` no
    // (:2665). Son hermanos y no ven lo mismo: aquí L vale «M», y M vale
    // «a;b». `$get_token` llega hasta «a;b» y cuenta con dos; `$get_token_amt`
    // se queda en «M» y cuenta uno.
    const g = corre([
      "setvard M 'a;b'",
      "setvard L 'M'",
      "setvard CUANTOS $get_token_amt(L)",
      "setvard PRIMERO $get_token(L,0)",
    ].join("\n"));
    assert.equal(g.guion.vars.get("CUANTOS"), "1", "no vuelve a resolver");
    assert.equal(g.guion.vars.get("PRIMERO"), "a", "éste sí");
  });
});

describe("`$get_token`, con el troceador bueno", () => {
  test("fuera de rango es «0», no vacío", () => {
    // `else return "0";` — script.cpp:2650.
    const g = corre("setvard L 'a;b'\nsetvard X $get_token(L,9)\nsetvard Y $get_token(L,-1)");
    assert.equal(g.guion.vars.get("X"), "0");
    assert.equal(g.guion.vars.get("Y"), "0");
  });

  test("y el hueco corta: el índice 2 de «a;;b» ya no existe", () => {
    // Con `split(";")` —como estaba desde el 33— esto devolvía «b».
    const g = corre("setvard L 'a;;b'\nsetvard X $get_token(L,2)");
    assert.equal(g.guion.vars.get("X"), "0");
  });
});

describe("`$get_by_name` + `deleteent`, que es como el alcalde apaga las catacumbas", () => {
  test("el asa va de un comando al otro y el generador desaparece", () => {
    const m = corre([
      "local L_CUR_SPAWN $get_token('spawners6;spawners7',0)",
      "local L_KILL_SPAWN $get_by_name(L_CUR_SPAWN)",
      "deleteent L_KILL_SPAWN remove",
    ].join("\n"));
    assert.deepEqual(m.borrados, ["spawners6"]);
    assert.equal(m.entidades.porNombre("spawners6"), null, "y ya no se encuentra");
    assert.ok(m.entidades.porNombre("spawners7"), "la otra sigue");
  });

  test("SIN `remove` detrás NO borra nada del mapa", () => {
    // `DelayedRemove()` es la baja de una entidad con guion; quitar algo que
    // puso el mapa es `UTIL_Remove` y sólo ocurre con `remove`
    // (scriptcmds.cpp:2891-2902, «Thothie FEB2015_19»). Es el error que se
    // comete al leer el comando por su nombre.
    const m = corre("local A $get_by_name(spawners6)\ndeleteent A");
    assert.deepEqual(m.borrados, []);
    assert.ok(m.entidades.porNombre("spawners6"), "sigue en pie");
    assert.ok(m.noSoportados.some((x) => x.nombre === "deleteent <ent>"),
      "y queda apuntado, no callado");
  });

  test("`fade` tampoco borra: desvanece", () => {
    const m = corre("local A $get_by_name(spawners6)\ndeleteent A fade 3");
    assert.deepEqual(m.borrados, []);
    assert.ok(m.noSoportados.some((x) => x.nombre.startsWith("deleteent ... fade")));
  });

  test("un nombre que no existe pasa por todo sin romper nada", () => {
    // `$get_by_name` da «0», `RetrieveEntity("0")` da NULL y el comando se
    // calla. Es la vuelta del bucle del alcalde que se pasa de la lista.
    const m = corre("local A $get_by_name(no_existe)\ndeleteent A remove");
    assert.deepEqual(m.borrados, []);
  });

  test("a un JUGADOR no se le puede borrar", () => {
    // «Don't allow a crash by deleting players» — scriptcmds.cpp:2879.
    const m = mundo();
    m.entorno.borrarEntidad("ent_lastspoke", { modo: "remove" });
    assert.deepEqual(m.borrados, []);
  });

  test("`deleteme` se apunta: un NPC borrándose a sí mismo no está portado", () => {
    const m = corre("deleteme");
    assert.ok(m.noSoportados.some((x) => x.nombre === "deleteme"));
  });
});

// ══ EL BUCLE DEL ALCALDE, ENTERO ═══════════════════════════════════════════

describe("`remove_spawns_loop`, tal cual lo escribe el alcalde", () => {
  /** El evento copiado del `.script`, palabra por palabra. */
  const BUCLE = [
    "{ remove_spawns",
    "setvard REMOVED_SPAWNS 1",
    'setvard SPAWN_LIST "spawners6;spawners7;spawners8;spawners9;spawners10"',
    "setvard RSPAWN_COUNT 0",
    "callevent remove_spawns_loop",
    "}",
    "{ remove_spawns_loop",
    "local L_CUR_SPAWN $get_token(SPAWN_LIST,RSPAWN_COUNT)",
    "local L_KILL_SPAWN $get_by_name(L_CUR_SPAWN)",
    "deleteent L_KILL_SPAWN remove",
    "local L_NSPAWNS $get_token_amt(SPAWN_LIST)",
    "subtract L_NSPAWNS 1",
    "if RSPAWN_COUNT < L_NSPAWNS",
    "add RSPAWN_COUNT 1",
    "callevent 1.0 remove_spawns_loop",
    "}",
  ].join("\n");

  /** Lo corre con un reloj de mentira que dispara lo encolado al momento. */
  function correBucle(areas) {
    const entidades = new Entidades();
    for (const a of areas) entidades.registrar(a);
    const borrados = [];
    const cola = [];
    const entorno = entornoDe({
      entidades,
      borrarDelMundo: (n) => borrados.push(n),
      programar: (_s, que) => cola.push(que),
    });
    const g = new Guion({ eventos: partirGuion(BUCLE).eventos, entorno });
    g.llamar("remove_spawns", []);
    // El bucle se reencola a sí mismo; se le da cuerda con tope, para que un
    // fallo de la condición de salida salga como un fallo y no como un cuelgue.
    for (let i = 0; i < 20 && cola.length; i++) cola.shift()();
    return { borrados, entidades, cola, guion: g };
  }

  test("borra los CINCO generadores de zombis, uno por vuelta, y para", () => {
    const r = correBucle(["spawners6", "spawners7", "spawners8", "spawners9", "spawners10", "spawners1"]);
    assert.deepEqual(r.borrados,
      ["spawners6", "spawners7", "spawners8", "spawners9", "spawners10"]);
    assert.deepEqual(r.cola, [], "y no se reencola una sexta vez");
    assert.ok(r.entidades.porNombre("spawners1"), "los de los goblins siguen");
  });

  test("y no le sobra ni le falta una vuelta: el `<` es la salida", () => {
    // `if RSPAWN_COUNT < L_NSPAWNS` es el `if` VIEJO, o sea que al fallar
    // abandona el bloque y no se reencola. Con `L_NSPAWNS` a 5-1=4, la última
    // vuelta útil es la del índice 4, que es «spawners10».
    const r = correBucle(["spawners6", "spawners7", "spawners8", "spawners9", "spawners10"]);
    assert.equal(r.borrados.length, 5);
  });

  test("no pasa nada si alguno ya no está: se lo salta y sigue", () => {
    const r = correBucle(["spawners6", "spawners9"]);
    assert.deepEqual(r.borrados, ["spawners6", "spawners9"]);
  });
});

// ══ LO QUE DE VERDAD PASA EN EL MAPA ═══════════════════════════════════════

describe("borrar un área de aparición deja de reponer, y no mata a nadie", () => {
  const censo = () => new Aparecedor({
    areas: [{ nombre: "spawners6" }],
    plantillas: [{ id: 7, area: "spawners6", vidas: -1, esperaMin: 5, esperaMax: 5, probabilidad: 100 }],
    azar: () => 0.5,
  });

  test("antes de borrarla, el zombi vuelve", () => {
    // El control positivo: sin él, «no reaparece» no significaría nada.
    const a = censo();
    a.tic(4);
    assert.ok(a.estaPuesto(7), "aparece a los 3 s");
    a.muerto(7);
    a.tic(6);
    assert.ok(a.estaPuesto(7), "y vuelve a los 5");
  });

  test("después, no vuelve", () => {
    const a = censo();
    a.tic(4);
    a.muerto(7);
    assert.equal(a.borrar("spawners6"), true);
    a.tic(60);
    assert.equal(a.estaPuesto(7), false);
  });

  test("pero el que YA estaba puesto sigue en el mundo", () => {
    // `UTIL_Remove` sobre el generador no toca a los monstruos que generó.
    const a = censo();
    a.tic(4);
    a.borrar("spawners6");
    assert.equal(a.estaPuesto(7), true);
  });

  test("borrar un área que no está devuelve `false` y no lanza", () => {
    assert.equal(censo().borrar("no_existe"), false);
  });
});

// Las globales son estáticas y compartidas: como en las demás pruebas de
// guiones, se vacían para que el orden de los archivos no cambie el resultado.
test("limpieza", () => { olvidarGlobales(); assert.equal(GLOBALES.size, 0); });
